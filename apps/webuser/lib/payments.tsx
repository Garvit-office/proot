'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError, brandColors, type PaymentIntent, type PaymentResult } from '@proot/shared';
import { api, useSocketEvent } from './session';

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
};
type RazorpayInstance = { open: () => void; on: (event: string, cb: (res: { error?: { description?: string } }) => void) => void };

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise: Promise<void> | null = null;

/** Loads Razorpay Checkout once per page load. */
export function loadRazorpay(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Payments run in the browser.'));
  if (window.Razorpay) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        script.remove();
        reject(new Error('Couldn’t load the payment window. Check your connection and try again.'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export type PaymentState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'open'; intent: PaymentIntent }
  | { phase: 'verifying'; intent: PaymentIntent }
  | { phase: 'paid'; result: PaymentResult }
  | { phase: 'dismissed' }
  | { phase: 'error'; message: string };

export function paymentErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError && error.status === 503) {
    return 'Online payments aren’t set up on this server yet. Your request is saved — try paying again later.';
  }
  return error instanceof Error ? error.message : 'The payment didn’t go through.';
}

/**
 * One reusable Razorpay flow. `pay(start)` calls `start()` to get a PaymentIntent (checkout,
 * createBooking, payOrder, payBooking…), opens Checkout, verifies the signature with the API, and
 * resolves `onPaid`. A `payment:updated` push (e.g. from the webhook) also completes it.
 */
export function usePayment(options: { onPaid?: (result: PaymentResult) => void; onSettled?: () => void } = {}) {
  const [state, setState] = useState<PaymentState>({ phase: 'idle' });
  const optsRef = useRef(options);
  optsRef.current = options;
  const activeRef = useRef<PaymentIntent | null>(null);
  const doneRef = useRef(false);

  const finish = useCallback((result: PaymentResult) => {
    if (doneRef.current) return;
    doneRef.current = true;
    activeRef.current = null;
    setState(result.status === 'PAID' ? { phase: 'paid', result } : { phase: 'error', message: 'The payment didn’t go through. You can try again.' });
    if (result.status === 'PAID') optsRef.current.onPaid?.(result);
    optsRef.current.onSettled?.();
  }, []);

  useSocketEvent('payment:updated', (result) => {
    const active = activeRef.current;
    if (active && result.paymentId === active.paymentId && result.status === 'PAID') finish(result);
  });

  useEffect(() => () => {
    activeRef.current = null;
  }, []);

  const pay = useCallback(async (start: () => Promise<PaymentIntent>) => {
    doneRef.current = false;
    setState({ phase: 'starting' });
    let intent: PaymentIntent;
    try {
      [intent] = await Promise.all([start(), loadRazorpay()]);
    } catch (error) {
      setState({ phase: 'error', message: paymentErrorMessage(error) });
      optsRef.current.onSettled?.();
      return;
    }
    if (!window.Razorpay) {
      setState({ phase: 'error', message: 'Couldn’t load the payment window.' });
      optsRef.current.onSettled?.();
      return;
    }
    activeRef.current = intent;
    const checkout = new window.Razorpay({
      key: intent.keyId,
      order_id: intent.razorpayOrderId,
      amount: intent.amountPaise,
      currency: intent.currency,
      name: intent.name,
      description: intent.description,
      prefill: intent.prefill,
      theme: { color: brandColors.teal },
      handler: (response) => {
        setState({ phase: 'verifying', intent });
        api
          .verifyPayment({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          })
          .then(finish)
          .catch((error) => {
            activeRef.current = null;
            setState({ phase: 'error', message: paymentErrorMessage(error) });
            optsRef.current.onSettled?.();
          });
      },
      modal: {
        ondismiss: () => {
          if (doneRef.current || activeRef.current !== intent) return;
          activeRef.current = null;
          setState({ phase: 'dismissed' });
          api.failPayment(intent.paymentId, 'Checkout closed').catch(() => {});
          optsRef.current.onSettled?.();
        },
      },
    });
    checkout.on('payment.failed', (res) => {
      setState({ phase: 'error', message: res.error?.description ?? 'The payment failed. You can try again.' });
    });
    setState({ phase: 'open', intent });
    checkout.open();
  }, [finish]);

  const reset = useCallback(() => setState({ phase: 'idle' }), []);
  const busy = state.phase === 'starting' || state.phase === 'open' || state.phase === 'verifying';

  return { state, pay, busy, reset };
}
