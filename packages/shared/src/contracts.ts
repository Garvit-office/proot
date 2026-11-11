import type { PetProfileInput } from "./onboarding.js";

// =====================================================================
// Roles and permissions
// =====================================================================

export const ROLES = ["USER", "PROVIDER", "EVENT_MANAGER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  USER: "Member",
  PROVIDER: "Care provider",
  EVENT_MANAGER: "Event manager",
  ADMIN: "Admin",
};

/** Can create, edit, publish, and delete events (admins: any event; managers: their own). */
export function canManageEvents(role: Role | null | undefined) {
  return role === "EVENT_MANAGER" || role === "ADMIN";
}

/** Can list care services and accept bookings (admins: any service; providers: their own). */
export function canOfferCare(role: Role | null | undefined) {
  return role === "PROVIDER" || role === "ADMIN";
}

/** Can use the admin console's user, catalogue, order, and audit tools. */
export function isAdmin(role: Role | null | undefined) {
  return role === "ADMIN";
}

/** Can sign in to the web admin console at all. */
export function canUseConsole(role: Role | null | undefined) {
  return canManageEvents(role) || canOfferCare(role);
}

// =====================================================================
// Common
// =====================================================================

export type GeoPoint = { lat: number; lng: number };

export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

export type ApiError = { error: string; fields?: { field: string; message: string }[] };

/** A short public view of another user. */
export type UserSummary = { id: string; name: string; avatarUrl: string | null };

// =====================================================================
// Users and auth
// =====================================================================

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string;
  avatarUrl: string | null;
  city: string;
  lat: number | null;
  lng: number | null;
  isActive: boolean;
  createdAt: string;
};

export type SessionUser = UserRecord;

export type MeResponse = UserRecord & {
  /** True once the user has finished pet onboarding (owns at least one pet). */
  onboarded: boolean;
  unreadNotifications: number;
  cartCount: number;
};

export type AuthResponse = { token: string; user: MeResponse };

export type ProfileInput = { name?: string; phone?: string; city?: string };

export type LocationInput = GeoPoint & { city?: string };

export type AuthTokenPayload = { sub: string; role: Role; ver: number };

export type AddressInput = {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

export type AddressRecord = AddressInput & { id: string; createdAt: string };

// =====================================================================
// Pets
// =====================================================================

/**
 * `photo` on input may be a new image as a data URL, an existing image URL (kept as is), or null.
 * On output it is always an image URL or null.
 */
export type PetInput = PetProfileInput & { discoverable?: boolean };

export type PetRecord = PetProfileInput & {
  id: string;
  userId: string;
  /** Human-readable age derived from birthDate, e.g. "3 years". */
  age: string;
  discoverable: boolean;
  createdAt: string;
  updatedAt: string;
};

// =====================================================================
// Images
// =====================================================================

export type ImageUpload = { id: string; url: string };

// =====================================================================
// Marketplace
// =====================================================================

export const PRODUCT_CATEGORIES = ["Food", "Toys", "Care", "Home", "Accessories", "Health"] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_CONDITIONS = ["New", "Like new", "Used"] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const LISTING_STATUSES = ["ACTIVE", "DRAFT", "SOLD_OUT", "ARCHIVED", "REMOVED"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** Orders at or above this subtotal ship free; below it SHIPPING_FEE_PAISE is added. */
export const FREE_SHIPPING_PAISE = 99_900;
export const SHIPPING_FEE_PAISE = 4_900;
export const MAX_PRODUCT_IMAGES = 6;

export type Product = {
  id: string;
  seller: UserSummary;
  title: string;
  description: string;
  category: ProductCategory;
  condition: ProductCondition;
  pricePaise: number;
  stock: number;
  status: ListingStatus;
  /** Absolute image URLs; the first is the cover. */
  images: string[];
  city: string;
  lat: number | null;
  lng: number | null;
  /** Distance from the `lat`/`lng` given in the query, when both are known. */
  distanceKm: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = {
  title: string;
  description: string;
  category: ProductCategory;
  condition: ProductCondition;
  pricePaise: number;
  stock: number;
  /** Sellers may set ACTIVE, DRAFT or ARCHIVED. SOLD_OUT is automatic; REMOVED is admin-only. */
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  /** Data URLs for new images, or existing image URLs to keep. Order is preserved. */
  images: string[];
  city?: string;
  lat?: number | null;
  lng?: number | null;
};

export type ProductQuery = {
  q?: string;
  category?: ProductCategory;
  sellerId?: string;
  /** Only the caller's own listings, in every status. */
  mine?: boolean;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sort?: "new" | "price_asc" | "price_desc" | "distance";
  limit?: number;
  offset?: number;
};

export type CartItem = {
  product: Product;
  quantity: number;
  lineTotalPaise: number;
  /** False when the listing is no longer active or stock is short; checkout will refuse it. */
  available: boolean;
};

export type Cart = {
  items: CartItem[];
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  count: number;
};

export const ORDER_STATUSES = ["PENDING_PAYMENT", "PAID", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const FULFILMENT_STATUSES = ["PENDING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number];

export type OrderItem = {
  id: string;
  productId: string | null;
  title: string;
  imageUrl: string | null;
  unitPaise: number;
  quantity: number;
  seller: UserSummary;
  fulfilment: FulfilmentStatus;
};

export type ShippingAddress = Omit<AddressInput, "label" | "isDefault">;

export type Order = {
  id: string;
  buyer: UserSummary & { email: string };
  status: OrderStatus;
  items: OrderItem[];
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  shippingAddress: ShippingAddress;
  placedAt: string;
  paidAt: string | null;
  updatedAt: string;
};

export type CheckoutInput = { addressId: string } | { address: ShippingAddress; saveAddress?: boolean };

// =====================================================================
// Payments (Razorpay)
// =====================================================================

export type PaymentPurpose = "ORDER" | "BOOKING";
export type PaymentStatus = "CREATED" | "PAID" | "FAILED" | "REFUNDED";

/** Everything a client needs to open Razorpay Checkout for one payment. */
export type PaymentIntent = {
  paymentId: string;
  purpose: PaymentPurpose;
  referenceId: string;
  razorpayOrderId: string;
  keyId: string;
  amountPaise: number;
  currency: "INR";
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  /**
   * A hosted checkout page on the API (for mobile: open it in an in-app browser).
   * It redirects to `returnUrl` (or shows a done screen) after payment.
   */
  checkoutUrl: string;
};

export type PaymentVerifyInput = {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

export type PaymentResult = {
  paymentId: string;
  status: PaymentStatus;
  purpose: PaymentPurpose;
  referenceId: string;
};

export type CheckoutResponse = { order: Order; payment: PaymentIntent };

// =====================================================================
// Care services and bookings
// =====================================================================

export const CARE_CATEGORIES = ["Walk", "Groom", "Vet", "Train", "Sit"] as const;
export type CareCategory = (typeof CARE_CATEGORIES)[number];

export type CareService = {
  id: string;
  provider: UserSummary;
  title: string;
  category: CareCategory;
  description: string;
  pricePaise: number;
  durationMin: number;
  imageUrl: string | null;
  city: string;
  lat: number | null;
  lng: number | null;
  serviceRadiusKm: number;
  distanceKm: number | null;
  isActive: boolean;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CareServiceInput = {
  title: string;
  category: CareCategory;
  description: string;
  pricePaise: number;
  durationMin: number;
  /** Data URL for a new image, the existing image URL to keep it, or null to remove it. */
  image?: string | null;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  serviceRadiusKm?: number;
  isActive?: boolean;
};

export type CareQuery = {
  q?: string;
  category?: CareCategory;
  providerId?: string;
  mine?: boolean;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sort?: "rating" | "price_asc" | "distance" | "new";
};

export type Review = {
  id: string;
  user: UserSummary;
  rating: number;
  comment: string;
  createdAt: string;
};

export type CareServiceDetail = CareService & { reviews: Review[] };

/** ISO start times that are free for this service on the given day. */
export type SlotsResponse = { date: string; durationMin: number; slots: string[] };

export const BOOKING_STATUSES = ["REQUESTED", "CONFIRMED", "DECLINED", "COMPLETED", "CANCELLED"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type Booking = {
  id: string;
  service: { id: string; title: string; category: CareCategory; imageUrl: string | null };
  provider: UserSummary;
  customer: UserSummary & { phone: string };
  pet: { id: string; name: string; photoUrl: string | null } | null;
  startsAt: string;
  endsAt: string;
  address: string;
  notes: string;
  pricePaise: number;
  status: BookingStatus;
  isPaid: boolean;
  review: Review | null;
  createdAt: string;
  updatedAt: string;
};

export type BookingInput = {
  serviceId: string;
  petId: string;
  startsAt: string;
  address: string;
  notes?: string;
};

export type BookingResponse = { booking: Booking; payment: PaymentIntent };

export type ReviewInput = { rating: number; comment?: string };

// =====================================================================
// Events
// =====================================================================

export type EventInput = {
  title: string;
  description: string;
  location: string;
  startsAt: string; // ISO timestamp
  /** Max RSVPs; 0 means no cap. */
  capacity: number;
  published: boolean;
  lat?: number | null;
  lng?: number | null;
  /** Data URL for a new image, the existing image URL to keep it, or null to remove it. */
  image?: string | null;
};

export type EventRecord = Omit<EventInput, "image" | "lat" | "lng"> & {
  id: string;
  lat: number | null;
  lng: number | null;
  imageUrl: string | null;
  distanceKm: number | null;
  managerId: string | null;
  managerName: string | null;
  rsvpCount: number;
  /** Whether the requesting user has RSVPed. */
  rsvped: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EventsResponse = {
  /** Published, upcoming events anyone signed in can RSVP to. */
  visible: EventRecord[];
  /** Events this user may edit: all of them for admins, their own for event managers, none for members. */
  manageable: EventRecord[];
};

export type EventAttendee = { userId: string; name: string; avatarUrl: string | null; createdAt: string };

export type EventDetail = EventRecord & {
  /** Only filled for the event's manager and admins. */
  attendees: EventAttendee[];
};

// =====================================================================
// Parks
// =====================================================================

export type Park = {
  id: string;
  name: string;
  description: string;
  address: string;
  lat: number;
  lng: number;
  hours: string;
  amenities: string[];
  imageUrl: string | null;
  distanceKm: number | null;
  /** Dogs checked in right now. */
  dogsNow: number;
  /** Whether the requesting user is checked in here. */
  checkedIn: boolean;
};

export type ParkPresence = { petId: string | null; petName: string; photoUrl: string | null; ownerName: string; since: string };

export type ParkDetail = Park & { present: ParkPresence[] };

export type ParkInput = {
  name: string;
  description: string;
  address: string;
  lat: number;
  lng: number;
  hours: string;
  amenities: string[];
  image?: string | null;
};

export type CheckinRecord = { id: string; parkId: string; parkName: string; petId: string | null; checkedInAt: string };

// =====================================================================
// Friends
// =====================================================================

export type DiscoverPet = {
  id: string;
  name: string;
  breed: string;
  age: string;
  sex: string;
  bio: string;
  prompt: string;
  answer: string;
  temperament: string[];
  photoUrl: string | null;
  ownerName: string;
  distanceKm: number | null;
};

export type GreetInput = { fromPetId: string; toPetId: string; liked: boolean };

export type ChatMessage = {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export type Match = {
  id: string;
  myPet: { id: string; name: string; photoUrl: string | null };
  theirPet: { id: string; name: string; photoUrl: string | null; breed: string };
  otherUser: UserSummary;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  createdAt: string;
};

export type GreetResponse = { matched: boolean; match: Match | null };

export type PendingGreetings = {
  /** Dogs that said hi to one of my dogs and are waiting on me. */
  incoming: (DiscoverPet & { toPetId: string; toPetName: string })[];
  /** Dogs my dogs said hi to that haven't answered yet. */
  outgoing: (DiscoverPet & { fromPetId: string; fromPetName: string })[];
};

// =====================================================================
// Nutrition
// =====================================================================

export type MealVerdict = "Good" | "Okay" | "Skip";

export type MealAnalysis = {
  id: string;
  label: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  notes: string;
  verdict: MealVerdict;
};

export type MealAnalyzeInput = { petId: string; photo?: string | null; label?: string };

export type MealAnalyzeResponse = {
  analysis: Omit<MealAnalysis, "id">;
  /** "ai" when Claude looked at the photo, "rules" for the built-in estimate. */
  source: "ai" | "rules";
  /** The stored photo, to pass back when saving the meal. */
  imageId: string | null;
  imageUrl: string | null;
};

export type MealInput = Omit<MealAnalysis, "id"> & {
  petId: string;
  source: "ai" | "rules";
  imageId?: string | null;
  eatenAt?: string;
};

export type MealRecord = Omit<MealAnalysis, "id"> & {
  id: string;
  petId: string;
  source: "ai" | "rules";
  imageUrl: string | null;
  eatenAt: string;
  createdAt: string;
};

export type MealsResponse = {
  items: MealRecord[];
  /** Totals for the requested day. */
  totalKcal: number;
  /** Suggested daily intake for this dog. */
  targetKcal: number;
};

// =====================================================================
// Activity
// =====================================================================

export const ACTIVITY_TYPES = ["Walk", "Meal", "Play", "Care", "Sleep", "Park", "Event"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** The types a user can log by hand; the rest are recorded automatically. */
export const LOGGABLE_ACTIVITY_TYPES = ["Walk", "Play", "Sleep", "Care"] as const;

export type ActivityInput = {
  petId: string;
  type: (typeof LOGGABLE_ACTIVITY_TYPES)[number];
  title: string;
  detail?: string;
  distanceKm?: number | null;
  durationMin?: number | null;
  occurredAt?: string;
};

export type ActivityRecord = {
  id: string;
  petId: string;
  type: ActivityType;
  title: string;
  detail: string;
  distanceKm: number | null;
  durationMin: number | null;
  kcal: number | null;
  occurredAt: string;
  /** Meals come from the nutrition log and are deleted there. */
  source: "activity" | "meal";
};

export type ActivitySummary = {
  walkKm: number;
  walkMin: number;
  playMin: number;
  sleepHours: number;
  kcalIn: number;
};

export type ActivityResponse = { items: ActivityRecord[]; summary: ActivitySummary; from: string; to: string };

// =====================================================================
// Home dashboard
// =====================================================================

export type HomeResponse = {
  pet: { id: string; name: string } | null;
  today: ActivitySummary & { targetKcal: number | null };
  nextEvent: EventRecord | null;
  nextBooking: Booking | null;
  dogsNearbyNow: number;
  nearestPark: Park | null;
  unreadNotifications: number;
};

// =====================================================================
// Notifications
// =====================================================================

export type NotificationRecord = {
  id: string;
  type: string;
  title: string;
  body: string;
  /** In-app path, e.g. "/orders/123". */
  link: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsResponse = { items: NotificationRecord[]; unread: number };

// =====================================================================
// Admin
// =====================================================================

export type AdminUserRecord = UserRecord & { petCount: number; lastLoginAt: string | null };

export type AdminStats = {
  users: Record<Role, number> & { total: number; newLast7Days: number; inactive: number };
  pets: number;
  events: { total: number; published: number; upcoming: number };
  rsvps: number;
  products: { total: number; active: number };
  orders: { total: number; paid: number; pendingPayment: number; revenuePaise: number; revenueLast30DaysPaise: number };
  bookings: { total: number; requested: number; confirmed: number; completed: number; revenuePaise: number };
  services: { total: number; active: number };
  parks: { total: number; dogsNow: number };
  auditLast24h: number;
};

export type AuditRecord = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  details: string;
  createdAt: string;
};

export type AdminListQuery = { q?: string; status?: string; limit?: number; offset?: number };
