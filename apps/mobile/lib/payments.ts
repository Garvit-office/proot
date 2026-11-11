import { ApiRequestError, type PaymentIntent, type PaymentResult } from "@proot/shared";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/lib/session";

export type PaymentOutcome =
  | { kind: "paid"; result: PaymentResult }
  | { kind: "pending"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "unavailable"; message: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Open the API-hosted Razorpay checkout in an auth session, then confirm the payment with the API. */
export async function openCheckout(intent: PaymentIntent): Promise<PaymentOutcome> {
  const returnUrl = Linking.createURL("payment");
  const session = await WebBrowser.openAuthSessionAsync(
    `${intent.checkoutUrl}&returnUrl=${encodeURIComponent(returnUrl)}`,
    returnUrl,
  );
  const redirected = session.type === "success" ? Linking.parse(session.url).queryParams?.status : undefined;

  // The hosted page verifies before redirecting, but the webhook path may lag a moment; poll briefly.
  let result = await api.getPayment(intent.paymentId);
  for (let i = 0; result.status === "CREATED" && redirected === "paid" && i < 5; i++) {
    await sleep(1200);
    result = await api.getPayment(intent.paymentId);
  }
  if (result.status === "PAID") return { kind: "paid", result };
  if (result.status === "FAILED" || redirected === "failed") return { kind: "failed", message: "The payment didn’t go through. You can try again." };
  return { kind: "pending", message: "Payment not completed. You can pay any time from the details screen." };
}

/** Get an intent (checkout, booking, or retry) and run it, turning the 503 "not configured" case into a message. */
export async function pay(getIntent: () => Promise<PaymentIntent>): Promise<PaymentOutcome> {
  let intent: PaymentIntent;
  try {
    intent = await getIntent();
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 503) return { kind: "unavailable", message: error.message || "Online payments aren’t set up yet." };
    throw error;
  }
  return openCheckout(intent);
}

export function outcomeMessage(outcome: PaymentOutcome) {
  return outcome.kind === "paid" ? "Payment received. Thank you!" : outcome.message;
}
