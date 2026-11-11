import type {
  ActivityInput,
  ActivityRecord,
  ActivityResponse,
  AddressInput,
  AddressRecord,
  AdminListQuery,
  AdminStats,
  AdminUserRecord,
  AuditRecord,
  AuthResponse,
  Booking,
  BookingInput,
  BookingResponse,
  BookingStatus,
  CareQuery,
  CareService,
  CareServiceDetail,
  CareServiceInput,
  Cart,
  CheckinRecord,
  CheckoutInput,
  CheckoutResponse,
  ChatMessage,
  DiscoverPet,
  EventDetail,
  EventInput,
  EventRecord,
  EventsResponse,
  FulfilmentStatus,
  GreetInput,
  GreetResponse,
  HomeResponse,
  ImageUpload,
  ListingStatus,
  LocationInput,
  Match,
  MealAnalyzeInput,
  MealAnalyzeResponse,
  MealInput,
  MealRecord,
  MealsResponse,
  MeResponse,
  NotificationsResponse,
  Order,
  OrderStatus,
  Page,
  Park,
  ParkDetail,
  ParkInput,
  PaymentIntent,
  PaymentResult,
  PaymentVerifyInput,
  PendingGreetings,
  PetInput,
  PetRecord,
  Product,
  ProductInput,
  ProductQuery,
  ProfileInput,
  Review,
  ReviewInput,
  Role,
  SlotsResponse,
} from "./contracts.js";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: { field: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type ApiClientOptions = {
  /** e.g. http://localhost:4000/api */
  baseUrl: string;
  getToken: () => string | null | Promise<string | null>;
  /** Called on any 401 from an authenticated request (expired token, deactivated account…). */
  onUnauthorized?: () => void;
};

type Query = Record<string, string | number | boolean | null | undefined>;

function toQuery(query?: Query) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Typed wrapper over the Proot backend, shared by webuser, webadmin and mobile. */
export function createApiClient({ baseUrl, getToken, onUnauthorized }: ApiClientOptions) {
  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown; token?: string | null; query?: Query } = {},
  ): Promise<T> {
    const token = init.token === undefined ? await getToken() : init.token;
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}${toQuery(init.query)}`, {
        method: init.method ?? "GET",
        headers: {
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch {
      throw new ApiRequestError("Can’t reach Proot right now. Check your connection and try again.", 0);
    }

    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && token) onUnauthorized?.();
      throw new ApiRequestError(data?.error ?? `Request failed (${res.status}).`, res.status, data?.fields ?? []);
    }
    return data as T;
  }

  const get = <T>(path: string, query?: Query) => request<T>(path, { query });
  const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: "POST", body });
  const patch = <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body });
  const put = <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body });
  const del = <T = void>(path: string) => request<T>(path, { method: "DELETE" });

  return {
    baseUrl,

    // ---- Auth and account -------------------------------------------------
    register: (body: { name: string; email: string; password: string }) =>
      request<AuthResponse>("/auth/register", { method: "POST", body, token: null }),
    login: (body: { email: string; password: string }) =>
      request<AuthResponse>("/auth/login", { method: "POST", body, token: null }),
    /** Invalidates every token for this account, including the current one. */
    logoutEverywhere: () => post<void>("/auth/logout-all"),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      post<{ token: string }>("/auth/password", body),
    me: (token?: string) => request<MeResponse>("/me", { token }),
    updateProfile: (body: ProfileInput) => patch<MeResponse>("/me", body),
    updateLocation: (body: LocationInput) => put<MeResponse>("/me/location", body),
    /** photo: data URL, or null to remove. */
    updateAvatar: (photo: string | null) => put<MeResponse>("/me/avatar", { photo }),
    listAddresses: () => get<AddressRecord[]>("/me/addresses"),
    createAddress: (body: AddressInput) => post<AddressRecord>("/me/addresses", body),
    updateAddress: (id: string, body: AddressInput) => patch<AddressRecord>(`/me/addresses/${id}`, body),
    deleteAddress: (id: string) => del(`/me/addresses/${id}`),

    home: (petId?: string) => get<HomeResponse>("/home", { petId }),

    // ---- Images -----------------------------------------------------------
    /** Upload a data URL (PNG, JPEG or WebP, up to ~6 MB). */
    uploadImage: (dataUrl: string) => post<ImageUpload>("/images", { dataUrl }),

    // ---- Pets -------------------------------------------------------------
    listPets: (token?: string) => request<PetRecord[]>("/pets", { token }),
    getPet: (id: string) => get<PetRecord>(`/pets/${id}`),
    createPet: (body: PetInput) => post<PetRecord>("/pets", body),
    updatePet: (id: string, body: PetInput) => patch<PetRecord>(`/pets/${id}`, body),
    deletePet: (id: string) => del(`/pets/${id}`),

    // ---- Marketplace ------------------------------------------------------
    listProducts: (query: ProductQuery = {}) => get<Page<Product>>("/products", query),
    getProduct: (id: string) => get<Product>(`/products/${id}`),
    createProduct: (body: ProductInput) => post<Product>("/products", body),
    updateProduct: (id: string, body: Partial<ProductInput>) => patch<Product>(`/products/${id}`, body),
    deleteProduct: (id: string) => del(`/products/${id}`),

    getCart: () => get<Cart>("/cart"),
    /** Sets the quantity (adds the item if it isn't in the cart). quantity 0 removes it. */
    setCartItem: (productId: string, quantity: number) => put<Cart>(`/cart/items/${productId}`, { quantity }),
    removeCartItem: (productId: string) => request<Cart>(`/cart/items/${productId}`, { method: "DELETE" }),
    clearCart: () => request<Cart>("/cart", { method: "DELETE" }),

    checkout: (body: CheckoutInput) => post<CheckoutResponse>("/orders", body),
    listOrders: () => get<Order[]>("/orders"),
    /** Orders that contain the caller's listings (only their own line items are included). */
    listSellingOrders: () => get<Order[]>("/orders/selling"),
    getOrder: (id: string) => get<Order>(`/orders/${id}`),
    payOrder: (id: string) => post<PaymentIntent>(`/orders/${id}/pay`),
    cancelOrder: (id: string) => post<Order>(`/orders/${id}/cancel`),
    /** Seller marks their line item as shipped / delivered. */
    updateOrderItem: (orderId: string, itemId: string, fulfilment: FulfilmentStatus) =>
      patch<Order>(`/orders/${orderId}/items/${itemId}`, { fulfilment }),

    // ---- Payments ---------------------------------------------------------
    verifyPayment: (body: PaymentVerifyInput) => post<PaymentResult>("/payments/verify", body),
    getPayment: (id: string) => get<PaymentResult>(`/payments/${id}`),
    /** Mark a checkout as abandoned or failed (the order/booking stays payable). */
    failPayment: (id: string, reason?: string) => post<PaymentResult>(`/payments/${id}/fail`, { reason }),

    // ---- Care -------------------------------------------------------------
    listServices: (query: CareQuery = {}) => get<CareService[]>("/care/services", query),
    getService: (id: string) => get<CareServiceDetail>(`/care/services/${id}`),
    getSlots: (id: string, date: string) => get<SlotsResponse>(`/care/services/${id}/slots`, { date }),
    createService: (body: CareServiceInput) => post<CareService>("/care/services", body),
    updateService: (id: string, body: Partial<CareServiceInput>) => patch<CareService>(`/care/services/${id}`, body),
    deleteService: (id: string) => del(`/care/services/${id}`),

    createBooking: (body: BookingInput) => post<BookingResponse>("/bookings", body),
    listBookings: () => get<Booking[]>("/bookings"),
    /** Bookings for the caller's services (providers and admins). */
    listProviderBookings: () => get<Booking[]>("/bookings/provider"),
    getBooking: (id: string) => get<Booking>(`/bookings/${id}`),
    setBookingStatus: (id: string, status: BookingStatus) => patch<Booking>(`/bookings/${id}/status`, { status }),
    payBooking: (id: string) => post<PaymentIntent>(`/bookings/${id}/pay`),
    reviewBooking: (id: string, body: ReviewInput) => post<Review>(`/bookings/${id}/review`, body),

    // ---- Events -----------------------------------------------------------
    listEvents: (near?: { lat: number; lng: number }) => get<EventsResponse>("/events", near),
    getEvent: (id: string) => get<EventDetail>(`/events/${id}`),
    createEvent: (body: EventInput) => post<EventRecord>("/events", body),
    updateEvent: (id: string, body: Partial<EventInput>) => patch<EventRecord>(`/events/${id}`, body),
    deleteEvent: (id: string) => del(`/events/${id}`),
    rsvp: (id: string) => post<EventRecord>(`/events/${id}/rsvp`),
    cancelRsvp: (id: string) => request<EventRecord>(`/events/${id}/rsvp`, { method: "DELETE" }),

    // ---- Parks ------------------------------------------------------------
    listParks: (near?: { lat?: number; lng?: number; radiusKm?: number }) => get<Park[]>("/parks", near),
    getPark: (id: string) => get<ParkDetail>(`/parks/${id}`),
    checkIn: (parkId: string, petId: string) => post<CheckinRecord>(`/parks/${parkId}/checkin`, { petId }),
    checkOut: () => post<void>("/parks/checkout"),
    currentCheckin: () => get<CheckinRecord | null>("/parks/checkin/current"),
    createPark: (body: ParkInput) => post<Park>("/parks", body),
    updatePark: (id: string, body: Partial<ParkInput>) => patch<Park>(`/parks/${id}`, body),
    deletePark: (id: string) => del(`/parks/${id}`),

    // ---- Friends ----------------------------------------------------------
    discoverPets: (petId: string, radiusKm?: number) => get<DiscoverPet[]>("/friends/discover", { petId, radiusKm }),
    greet: (body: GreetInput) => post<GreetResponse>("/friends/greet", body),
    pendingGreetings: () => get<PendingGreetings>("/friends/pending"),
    listMatches: () => get<Match[]>("/friends/matches"),
    unmatch: (matchId: string) => del(`/friends/matches/${matchId}`),
    listMessages: (matchId: string, before?: string) => get<ChatMessage[]>(`/friends/matches/${matchId}/messages`, { before }),
    sendMessage: (matchId: string, body: string) => post<ChatMessage>(`/friends/matches/${matchId}/messages`, { body }),
    markMatchRead: (matchId: string) => post<void>(`/friends/matches/${matchId}/read`),

    // ---- Nutrition --------------------------------------------------------
    analyzeMeal: (body: MealAnalyzeInput) => post<MealAnalyzeResponse>("/meals/analyze", body),
    saveMeal: (body: MealInput) => post<MealRecord>("/meals", body),
    /** date: YYYY-MM-DD in the user's local day; tzOffset: minutes from Date#getTimezoneOffset(). */
    listMeals: (petId: string, date?: string, tzOffset?: number) => get<MealsResponse>("/meals", { petId, date, tzOffset }),
    deleteMeal: (id: string) => del(`/meals/${id}`),

    // ---- Activity ---------------------------------------------------------
    listActivity: (petId: string, opts: { date?: string; days?: number; tzOffset?: number } = {}) =>
      get<ActivityResponse>("/activities", { petId, ...opts }),
    logActivity: (body: ActivityInput) => post<ActivityRecord>("/activities", body),
    deleteActivity: (id: string) => del(`/activities/${id}`),

    // ---- Notifications ----------------------------------------------------
    listNotifications: () => get<NotificationsResponse>("/notifications"),
    /** No ids marks everything read. */
    markNotificationsRead: (ids?: string[]) => post<{ unread: number }>("/notifications/read", { ids }),

    // ---- Admin ------------------------------------------------------------
    adminStats: () => get<AdminStats>("/admin/stats"),
    adminUsers: (query: AdminListQuery = {}) => get<Page<AdminUserRecord>>("/admin/users", query),
    setUserRole: (id: string, role: Role) => patch<{ id: string; role: Role }>(`/admin/users/${id}/role`, { role }),
    setUserActive: (id: string, isActive: boolean) => patch<{ id: string; isActive: boolean }>(`/admin/users/${id}/active`, { isActive }),
    adminProducts: (query: AdminListQuery = {}) => get<Page<Product>>("/admin/products", query),
    setProductStatus: (id: string, status: ListingStatus) => patch<Product>(`/admin/products/${id}/status`, { status }),
    adminOrders: (query: AdminListQuery = {}) => get<Page<Order>>("/admin/orders", query),
    /** Admins may cancel (refunding if paid) or move fulfilment forward. */
    setOrderStatus: (id: string, status: OrderStatus) => patch<Order>(`/admin/orders/${id}/status`, { status }),
    adminBookings: (query: AdminListQuery = {}) => get<Page<Booking>>("/admin/bookings", query),
    adminServices: (query: AdminListQuery = {}) => get<Page<CareService>>("/admin/services", query),
    adminAudit: (limit = 100) => get<AuditRecord[]>("/admin/audit", { limit }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
