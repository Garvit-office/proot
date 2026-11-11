import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import jwt from 'jsonwebtoken';
import type { PaymentIntent, PaymentPurpose, PaymentResult } from '@proot/shared';
import { appConfig, paymentsEnabled } from '../config.js';
import { one, pool, query, tx, type Db } from '../db.js';
import { apiOrigin } from './context.js';
import { HttpError } from './http.js';
import { emitToUsers } from './realtime.js';

/**
 * Development-only switch for running the whole checkout flow without network access to Razorpay:
 * orders get local ids and refunds are skipped. Signatures are still verified with RAZORPAY_KEY_SECRET.
 * Ignored when NODE_ENV=production.
 */
const offlineTest = () => process.env.RAZORPAY_OFFLINE_TEST === 'true' && !appConfig.isProduction;

let client: Razorpay | null = null;
function razorpay() {
  if (!paymentsEnabled()) {
    throw new HttpError(503, 'Online payments are not set up yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.');
  }
  client ??= new Razorpay({ key_id: appConfig.razorpay.keyId, key_secret: appConfig.razorpay.keySecret });
  return client;
}

export function assertPaymentsReady() {
  razorpay();
}

function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Razorpay Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string) {
  const expected = createHmac('sha256', appConfig.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook_secret). */
export function webhookSignatureValid(rawBody: Buffer, signature: string) {
  if (!appConfig.razorpay.webhookSecret) return false;
  const expected = createHmac('sha256', appConfig.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

// ---------------------------------------------------------------- handlers

type Handler = {
  /** Called once, inside the transaction that marks the payment PAID. */
  onPaid: (referenceId: string, db: Db) => Promise<void>;
  /** Runs after commit, for notifications and realtime pushes. */
  afterPaid?: (referenceId: string) => Promise<void>;
};
const handlers: Partial<Record<PaymentPurpose, Handler>> = {};
export const registerPaymentHandler = (purpose: PaymentPurpose, handler: Handler) => {
  handlers[purpose] = handler;
};

export const toPaymentResult = (row: any): PaymentResult => ({ paymentId: row.id, status: row.status, purpose: row.purpose, referenceId: row.reference_id });

// ---------------------------------------------------------------- intents

export async function createPaymentIntent(opts: {
  user: { id: string; name: string; email: string; phone: string };
  purpose: PaymentPurpose;
  referenceId: string;
  amountPaise: number;
  description: string;
}, db: Db = pool): Promise<PaymentIntent> {
  const gateway = razorpay();
  if (opts.amountPaise < 100) throw new HttpError(400, 'The amount must be at least ₹1.');

  const receipt = `${opts.purpose.toLowerCase()}_${opts.referenceId.slice(0, 30)}`;
  const rpOrder = offlineTest()
    ? { id: `order_test_${randomBytes(7).toString('hex')}` }
    : await gateway.orders.create({
        amount: opts.amountPaise,
        currency: 'INR',
        receipt,
        notes: { purpose: opts.purpose, reference_id: opts.referenceId, user_id: opts.user.id },
      } as any).catch((error: any) => {
        console.error('Razorpay order create failed:', error?.error ?? error);
        throw new HttpError(502, 'We couldn’t start the payment with Razorpay. Please try again.');
      });

  const row = await one(
    `INSERT INTO payments (user_id, purpose, reference_id, amount_paise, razorpay_order_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [opts.user.id, opts.purpose, opts.referenceId, opts.amountPaise, rpOrder.id],
    db,
  );

  const checkoutToken = jwt.sign({ pid: row.id, sub: opts.user.id, kind: 'checkout' }, appConfig.jwtSecret, { expiresIn: '1h' });
  return {
    paymentId: row.id,
    purpose: opts.purpose,
    referenceId: opts.referenceId,
    razorpayOrderId: rpOrder.id,
    keyId: appConfig.razorpay.keyId,
    amountPaise: opts.amountPaise,
    currency: 'INR',
    name: 'Proot',
    description: opts.description,
    prefill: { name: opts.user.name, email: opts.user.email, contact: opts.user.phone },
    checkoutUrl: `${apiOrigin()}/api/payments/${row.id}/checkout?t=${encodeURIComponent(checkoutToken)}`,
  };
}

export function verifyCheckoutToken(token: string, paymentId: string) {
  try {
    const payload = jwt.verify(token, appConfig.jwtSecret) as { pid: string; sub: string; kind: string };
    return payload.kind === 'checkout' && payload.pid === paymentId ? payload.sub : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- state changes

/**
 * Idempotently mark a Razorpay order as paid (from Checkout verification or the webhook) and run the
 * purpose handler. Returns the payment row.
 */
export async function markPaid(razorpayOrderId: string, razorpayPaymentId: string, signature: string | null) {
  let firstTime = false;
  const row = await tx(async (db) => {
    const payment = await one('SELECT * FROM payments WHERE razorpay_order_id = $1 FOR UPDATE', [razorpayOrderId], db);
    if (!payment) throw new HttpError(404, 'Payment not found.');
    if (payment.status === 'PAID' || payment.status === 'REFUNDED') return payment;
    const updated = await one(
      `UPDATE payments SET status = 'PAID', razorpay_payment_id = $2, razorpay_signature = COALESCE($3, razorpay_signature), failure_reason = NULL
       WHERE id = $1 RETURNING *`,
      [payment.id, razorpayPaymentId, signature],
      db,
    );
    await handlers[payment.purpose as PaymentPurpose]?.onPaid(payment.reference_id, db);
    firstTime = true;
    return updated;
  });
  emitToUsers([row.user_id], 'payment:updated', toPaymentResult(row));
  if (firstTime) await handlers[row.purpose as PaymentPurpose]?.afterPaid?.(row.reference_id).catch((e) => console.error(e));
  return row;
}

export async function markFailed(paymentId: string, reason: string) {
  const row = await one(
    `UPDATE payments SET status = 'FAILED', failure_reason = $2 WHERE id = $1 AND status = 'CREATED' RETURNING *`,
    [paymentId, reason.slice(0, 300)],
  );
  if (row) emitToUsers([row.user_id], 'payment:updated', toPaymentResult(row));
  return row;
}

/** Refund every PAID payment for a reference (e.g. a cancelled order or declined booking). */
export async function refundFor(purpose: PaymentPurpose, referenceId: string, db: Db = pool) {
  const paid = await query(`SELECT * FROM payments WHERE purpose = $1 AND reference_id = $2 AND status = 'PAID'`, [purpose, referenceId], db);
  for (const payment of paid) {
    if (!offlineTest() && payment.razorpay_payment_id) {
      try {
        await razorpay().payments.refund(payment.razorpay_payment_id, { amount: payment.amount_paise } as any);
      } catch (error: any) {
        console.error('Razorpay refund failed:', error?.error ?? error);
        throw new HttpError(502, 'Razorpay could not process the refund. Nothing was changed; please try again.');
      }
    }
    await query(`UPDATE payments SET status = 'REFUNDED' WHERE id = $1`, [payment.id], db);
  }
  return paid.length > 0;
}
