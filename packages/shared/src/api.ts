import type {
  AdminStats,
  AdminUserRecord,
  AuditRecord,
  AuthResponse,
  EventInput,
  EventRecord,
  EventsResponse,
  MeResponse,
  PetRecord,
  Role,
} from "./contracts.js";
import type { PetProfileInput } from "./onboarding.js";

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type ApiClientOptions = {
  baseUrl: string;
  getToken: () => string | null | Promise<string | null>;
};

/** Thin typed wrapper over the Proot backend, shared by webuser and mobile. */
export function createApiClient({ baseUrl, getToken }: ApiClientOptions) {
  async function request<T>(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
    const token = init.token === undefined ? await getToken() : init.token;
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
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
    if (!res.ok) throw new ApiRequestError(data?.error ?? `Request failed (${res.status}).`, res.status);
    return data as T;
  }

  return {
    register: (body: { name: string; email: string; password: string }) =>
      request<AuthResponse>("/register", { method: "POST", body, token: null }),
    login: (body: { email: string; password: string }) =>
      request<AuthResponse>("/login", { method: "POST", body, token: null }),
    me: (token?: string) => request<MeResponse>("/me", { token }),
    listPets: (token?: string) => request<PetRecord[]>("/pets", { token }),
    createPet: (body: PetProfileInput) => request<PetRecord>("/pets", { method: "POST", body }),
    updatePet: (id: string, body: PetProfileInput) => request<PetRecord>(`/pets/${id}`, { method: "PATCH", body }),
    deletePet: (id: string) => request<void>(`/pets/${id}`, { method: "DELETE" }),

    listEvents: () => request<EventsResponse>("/events"),
    createEvent: (body: EventInput) => request<EventRecord>("/events", { method: "POST", body }),
    updateEvent: (id: string, body: Partial<EventInput>) => request<EventRecord>(`/events/${id}`, { method: "PATCH", body }),
    deleteEvent: (id: string) => request<void>(`/events/${id}`, { method: "DELETE" }),
    rsvp: (id: string) => request<EventRecord>(`/events/${id}/rsvp`, { method: "POST" }),
    cancelRsvp: (id: string) => request<EventRecord>(`/events/${id}/rsvp`, { method: "DELETE" }),

    adminStats: () => request<AdminStats>("/admin/stats"),
    adminUsers: () => request<AdminUserRecord[]>("/admin/users"),
    setUserRole: (id: string, role: Role) => request<{ id: string; role: Role }>(`/admin/users/${id}/role`, { method: "PATCH", body: { role } }),
    adminAudit: (limit = 100) => request<AuditRecord[]>(`/admin/audit?limit=${limit}`),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
