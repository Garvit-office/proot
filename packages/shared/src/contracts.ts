import type { PetProfileInput } from "./onboarding.js";

export const ROLES = ["USER", "EVENT_MANAGER", "ADMIN"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  USER: "Member",
  EVENT_MANAGER: "Event manager",
  ADMIN: "Admin",
};

/** Can create, edit, publish, and delete events (admins: any event; managers: their own). */
export function canManageEvents(role: Role | null | undefined) {
  return role === "EVENT_MANAGER" || role === "ADMIN";
}

/** Can use the admin console's user, role, and audit tools. */
export function isAdmin(role: Role | null | undefined) {
  return role === "ADMIN";
}

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
};

export type PetRecord = PetProfileInput & {
  id: string;
  userId: string;
  /** Human-readable age derived from birthDate, e.g. "3 years". */
  age: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionUser = Omit<UserRecord, "createdAt">;

export type AuthResponse = {
  token: string;
  user: SessionUser;
};

export type MeResponse = SessionUser & {
  /** True once the user has finished pet onboarding (owns at least one pet). */
  onboarded: boolean;
};

export type NutritionRecord = {
  id: string;
  userId: string;
  label: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  verdict: "Good" | "Okay" | "Skip";
  notes: string;
  photo?: string | null;
  createdAt: string;
};

export type EventInput = {
  title: string;
  description: string;
  location: string;
  startsAt: string; // ISO timestamp
  /** Max RSVPs; 0 means no cap. */
  capacity: number;
  published: boolean;
};

export type EventRecord = EventInput & {
  id: string;
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

export type RSVPRecord = {
  id: string;
  eventId: string;
  userId: string;
  createdAt: string;
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

export type AdminUserRecord = UserRecord & {
  petCount: number;
};

export type AdminStats = {
  users: Record<Role, number> & { total: number; newLast7Days: number };
  pets: number;
  events: { total: number; published: number; upcoming: number };
  rsvps: number;
  auditLast24h: number;
};

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: Role;
  name: string;
};

export type ApiError = {
  error: string;
};
