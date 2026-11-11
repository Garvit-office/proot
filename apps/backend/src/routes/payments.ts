import { randomBytes } from 'node:crypto';
import express, { Router } from 'express';
import { z } from 'zod';
import { rupees } from '@proot/shared';
import jwt from 'jsonwebtoken';
import { authRequired, type AuthedRequest } from '../auth.js';
import { appConfig } from '../config.js';
import { one } from '../db.js';
import { HttpError, h, idParam, notFound, parse } from '../lib/http.js';
import { checkoutSignatureValid, markFailed, markPaid, toPaymentResult, verifyCheckoutToken, webhookSignatureValid } from '../lib/payments.js';

export const paymentsRouter = Router();

const verifySchema = z.object({
  razorpayOrderId: z.string().min(1).max(64),
  razorpayPaymentId: z.string().min(1).max(64),
  razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid signature.'),
});

/** Called by clients after Razorpay Checkout succeeds. The signature proves the payment is genuine. */
paymentsRouter.post('/payments/verify', sessionOrCheckoutAuth, h<AuthedRequest>(async (req, res) => {
  const body = parse(verifySchema, req.body);
  const payment = await one('SELECT * FROM payments WHERE razorpay_order_id = $1', [body.razorpayOrderId]);
  if (!payment || payment.user_id !== req.user!.id) throw notFound('Payment not found.');
  if (!checkoutSignatureValid(body.razorpayOrderId, body.razorpayPaymentId, body.razorpaySignature)) {
    await markFailed(payment.id, 'Signature verification failed');
    throw new HttpError(400, 'We couldn’t verify this payment. If money was taken, it will be refunded automatically.');
  }
  res.json(toPaymentResult(await markPaid(body.razorpayOrderId, body.razorpayPaymentId, body.razorpaySignature)));
}));

paymentsRouter.get('/payments/:id', authRequired, h<AuthedRequest>(async (req, res) => {
  const payment = await one('SELECT * FROM payments WHERE id = $1', [idParam(req)]);
  if (!payment || (payment.user_id !== req.user!.id && req.user!.role !== 'ADMIN')) throw notFound('Payment not found.');
  res.json(toPaymentResult(payment));
}));

paymentsRouter.post('/payments/:id/fail', authRequired, h<AuthedRequest>(async (req, res) => {
  const payment = await one('SELECT * FROM payments WHERE id = $1', [idParam(req)]);
  if (!payment || payment.user_id !== req.user!.id) throw notFound('Payment not found.');
  const reason = parse(z.object({ reason: z.string().max(300).optional() }), req.body).reason ?? 'Checkout closed';
  res.json(toPaymentResult((await markFailed(payment.id, reason)) ?? payment));
}));

/**
 * Razorpay webhook (configure in Dashboard → Settings → Webhooks with events payment.captured,
 * order.paid and payment.failed). Mounted with a raw body parser so the signature can be checked.
 */
export const webhookHandler = [
  express.raw({ type: 'application/json', limit: '1mb' }),
  h(async (req, res) => {
    const signature = String(req.headers['x-razorpay-signature'] ?? '');
    if (!Buffer.isBuffer(req.body) || !webhookSignatureValid(req.body, signature)) {
      return res.status(400).json({ error: 'Invalid webhook signature.' });
    }
    const event = JSON.parse(req.body.toString('utf8'));
    const entity = event?.payload?.payment?.entity;
    try {
      if ((event.event === 'payment.captured' || event.event === 'order.paid') && entity?.order_id) {
        await markPaid(entity.order_id, entity.id, null);
      } else if (event.event === 'payment.failed' && entity?.order_id) {
        const payment = await one('SELECT id FROM payments WHERE razorpay_order_id = $1', [entity.order_id]);
        if (payment) await markFailed(payment.id, entity.error_description ?? 'Payment failed');
      }
    } catch (error) {
      // Unknown orders (e.g. from another environment) are acknowledged so Razorpay stops retrying.
      if (!(error instanceof HttpError && error.status === 404)) throw error;
    }
    res.json({ ok: true });
  }),
];

/** JSON that is safe to embed inside a <script> element. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Only redirect back to the app's own schemes / web origin. */
function safeReturnUrl(value: unknown) {
  const url = typeof value === 'string' ? value : '';
  if (/^(proot|exp|exps):\/\//.test(url)) return url;
  if (url.startsWith(appConfig.webUserUrl)) return url;
  return '';
}

/**
 * Hosted checkout page for mobile (and any client that can't embed Razorpay Checkout).
 * Opened with a short-lived token from PaymentIntent.checkoutUrl; after paying it calls /verify and
 * redirects to `returnUrl?status=paid|failed&paymentId=…`.
 */
paymentsRouter.get('/payments/:id/checkout', h(async (req, res) => {
  const paymentId = idParam(req);
  const userId = verifyCheckoutToken(String(req.query.t ?? ''), paymentId);
  if (!userId) return res.status(401).send('This payment link has expired. Go back to the app and try again.');
  const payment = await one(
    `SELECT p.*, u.name, u.email, u.phone FROM payments p JOIN users u ON u.id = p.user_id WHERE p.id = $1 AND p.user_id = $2`,
    [paymentId, userId],
  );
  if (!payment) return res.status(404).send('Payment not found.');

  const returnUrl = safeReturnUrl(req.query.returnUrl);
  const nonce = randomBytes(16).toString('base64');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'nonce-${nonce}' https://checkout.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; connect-src 'self' https://*.razorpay.com; img-src * data:; style-src 'unsafe-inline'`,
  );
  const config = {
    key: appConfig.razorpay.keyId,
    order_id: payment.razorpay_order_id,
    amount: payment.amount_paise,
    currency: 'INR',
    name: 'Proot',
    description: payment.purpose === 'ORDER' ? 'Marketplace order' : 'Care booking',
    prefill: { name: payment.name, email: payment.email, contact: payment.phone },
    theme: { color: '#2f6b4f' },
  };
  const token = String(req.query.t);
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pay ${escapeHtml(rupees(payment.amount_paise))} · Proot</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f4ef;color:#1d2a22}
main{text-align:center;padding:24px;max-width:360px}button{font:inherit;padding:12px 20px;border-radius:999px;border:0;background:#2f6b4f;color:#fff;cursor:pointer}</style></head>
<body><main><h1>${escapeHtml(rupees(payment.amount_paise))}</h1><p id="msg">${payment.status === 'PAID' ? 'Already paid.' : 'Opening secure checkout…'}</p>
<button id="pay" hidden>Pay now</button></main>
<script nonce="${nonce}" src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script nonce="${nonce}">
const cfg = ${scriptJson(config)}; const ret = ${scriptJson(returnUrl)};
const paid = ${scriptJson(payment.status === 'PAID')};
const msg = document.getElementById('msg'); const btn = document.getElementById('pay');
function done(status) { if (ret) location.href = ret + (ret.includes('?') ? '&' : '?') + 'status=' + status + '&paymentId=${payment.id}'; else msg.textContent = status === 'paid' ? 'Payment received. You can close this window.' : 'Payment not completed.'; }
async function verify(r) {
  msg.textContent = 'Confirming payment…';
  const res = await fetch('/api/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ${escapeHtml(token)}' },
    body: JSON.stringify({ razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature }) });
  done(res.ok ? 'paid' : 'failed');
}
function open() {
  const rzp = new Razorpay({ ...cfg, handler: verify, modal: { ondismiss: () => { msg.textContent = 'Checkout closed.'; btn.hidden = false; } } });
  rzp.on('payment.failed', (e) => { msg.textContent = e.error && e.error.description || 'Payment failed.'; btn.hidden = false; });
  rzp.open();
}
btn.onclick = open;
if (paid) done('paid'); else open();
</script></body></html>`);
}));

/**
 * /payments/verify accepts a normal session token, or the short-lived checkout token used by the hosted
 * checkout page — the latter only for the one payment it was issued for.
 */
function sessionOrCheckoutAuth(req: AuthedRequest, res: any, next: any) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  let checkout: { pid: string; sub: string; kind: string } | null = null;
  try {
    const decoded = jwt.verify(token, appConfig.jwtSecret) as any;
    if (decoded?.kind === 'checkout') checkout = decoded;
  } catch {
    // not a checkout token; fall through to session auth
  }
  if (!checkout) return authRequired(req, res, next);
  one('SELECT p.id, p.razorpay_order_id, u.id AS user_id, u.email, u.name, u.role, u.phone, u.lat, u.lng FROM payments p JOIN users u ON u.id = p.user_id WHERE p.id = $1 AND u.is_active', [checkout.pid])
    .then((row) => {
      if (!row || row.user_id !== checkout!.sub || row.razorpay_order_id !== req.body?.razorpayOrderId) {
        return next(new HttpError(401, 'This payment link has expired.'));
      }
      req.user = { id: row.user_id, email: row.email, name: row.name, role: row.role, phone: row.phone, lat: row.lat, lng: row.lng };
      next();
    })
    .catch(next);
}
