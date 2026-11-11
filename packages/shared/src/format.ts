/** Formats integer paise as rupees, e.g. 129900 -> "₹1,299" and 4950 -> "₹49.50". */
export function rupees(paise: number) {
  const value = paise / 100;
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Converts a rupee amount typed by a user (e.g. "1299.5") to paise; NaN if invalid. */
export function toPaise(rupeesText: string | number) {
  const value = typeof rupeesText === "number" ? rupeesText : Number(String(rupeesText).replace(/[,₹\s]/g, ""));
  return Number.isFinite(value) ? Math.round(value * 100) : Number.NaN;
}

export function formatDistance(km: number | null | undefined) {
  if (km === null || km === undefined) return "";
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(km < 10 ? 1 : 0)} km away`;
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** YYYY-MM-DD for a Date in the device's local time zone. */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export const ORDER_STATUS_LABELS = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
} as const;

export const BOOKING_STATUS_LABELS = {
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
} as const;
