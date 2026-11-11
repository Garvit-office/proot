import type { BookingStatus, FulfilmentStatus, OrderStatus } from "@proot/shared";
import type { Tone } from "@/components/ui";

export const orderTone: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: "warn",
  PAID: "brand",
  SHIPPED: "accent",
  DELIVERED: "good",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
};

export const fulfilmentLabel: Record<FulfilmentStatus, string> = {
  PENDING: "Preparing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const fulfilmentTone: Record<FulfilmentStatus, Tone> = { PENDING: "warn", SHIPPED: "accent", DELIVERED: "good", CANCELLED: "neutral" };

export const bookingTone: Record<BookingStatus, Tone> = {
  REQUESTED: "warn",
  CONFIRMED: "brand",
  DECLINED: "bad",
  COMPLETED: "good",
  CANCELLED: "neutral",
};
