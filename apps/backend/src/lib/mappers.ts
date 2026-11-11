import { formatAge, type Booking, type CareService, type EventRecord, type MeResponse, type Order, type Park, type PetRecord, type Product, type Review, type UserRecord, type UserSummary } from '@proot/shared';
import { imageUrl, pickImage } from './images.js';

const iso = (v: any) => (v instanceof Date ? v.toISOString() : v ?? null);
const num = (v: any) => (v === null || v === undefined ? null : Number(v));
const round1 = (v: any) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);

export const summary = (id: string, name: string, avatarId: string | null): UserSummary => ({ id, name, avatarUrl: imageUrl(avatarId) });

export function toUser(row: any): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    avatarUrl: imageUrl(row.avatar_image_id),
    city: row.city,
    lat: num(row.lat),
    lng: num(row.lng),
    isActive: row.is_active,
    createdAt: iso(row.created_at),
  };
}

export function toMe(row: any, extra: { onboarded: boolean; unreadNotifications: number; cartCount: number }): MeResponse {
  return { ...toUser(row), ...extra };
}

export function toPet(row: any): PetRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    photo: imageUrl(row.photo_image_id),
    breed: row.breed,
    sex: row.sex,
    birthDate: row.birth_date,
    birthDateApprox: row.birth_date_approx,
    age: formatAge(row.birth_date),
    weightKg: Number(row.weight_kg),
    neutered: row.neutered,
    vaccinations: row.vaccinations ?? [],
    allergies: row.allergies,
    conditions: row.conditions,
    vetName: row.vet_name,
    vetPhone: row.vet_phone,
    microchipId: row.microchip_id,
    dietType: row.diet_type,
    mealsPerDay: row.meals_per_day,
    activityLevel: row.activity_level,
    temperament: row.temperament ?? [],
    social: row.social,
    bio: row.bio,
    prompt: row.prompt,
    answer: row.answer,
    discoverable: row.discoverable,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** Expects products p joined with seller columns seller_name, seller_avatar, and optional distance_km. */
export function toProduct(row: any): Product {
  const images = (row.image_ids ?? []).map((id: string) => imageUrl(id)!);
  if (!images.length && row.image_url) images.push(row.image_url);
  return {
    id: row.id,
    seller: summary(row.seller_id, row.seller_name, row.seller_avatar),
    title: row.title,
    description: row.description,
    category: row.category,
    condition: row.condition,
    pricePaise: row.price_paise,
    stock: row.stock,
    status: row.status,
    images,
    city: row.city,
    lat: num(row.lat),
    lng: num(row.lng),
    distanceKm: round1(row.distance_km),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toService(row: any): CareService {
  return {
    id: row.id,
    provider: summary(row.provider_id, row.provider_name, row.provider_avatar),
    title: row.title,
    category: row.category,
    description: row.description,
    pricePaise: row.price_paise,
    durationMin: row.duration_min,
    imageUrl: pickImage(row.image_id, row.image_url),
    city: row.city,
    lat: num(row.lat),
    lng: num(row.lng),
    serviceRadiusKm: Number(row.service_radius_km),
    distanceKm: round1(row.distance_km),
    isActive: row.is_active,
    ratingAvg: Number(row.rating_avg),
    ratingCount: row.rating_count,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toReview(row: any): Review {
  return { id: row.id, user: summary(row.user_id, row.user_name, row.user_avatar), rating: row.rating, comment: row.comment, createdAt: iso(row.created_at) };
}

export function toBooking(row: any): Booking {
  return {
    id: row.id,
    service: { id: row.service_id, title: row.service_title, category: row.service_category, imageUrl: pickImage(row.service_image_id, row.service_image_url) },
    provider: summary(row.provider_id, row.provider_name, row.provider_avatar),
    customer: { ...summary(row.user_id, row.customer_name, row.customer_avatar), phone: row.customer_phone },
    pet: row.pet_id ? { id: row.pet_id, name: row.pet_name, photoUrl: imageUrl(row.pet_photo) } : null,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    address: row.address,
    notes: row.notes,
    pricePaise: row.price_paise,
    status: row.status,
    isPaid: row.is_paid,
    review: row.review_id
      ? { id: row.review_id, user: summary(row.user_id, row.customer_name, row.customer_avatar), rating: row.review_rating, comment: row.review_comment, createdAt: iso(row.review_created_at) }
      : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toEvent(row: any): EventRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    lat: num(row.lat),
    lng: num(row.lng),
    startsAt: iso(row.starts_at),
    capacity: row.capacity,
    published: row.published,
    imageUrl: pickImage(row.image_id, row.image_url),
    distanceKm: round1(row.distance_km),
    managerId: row.manager_id,
    managerName: row.manager_name ?? null,
    rsvpCount: Number(row.rsvp_count ?? 0),
    rsvped: Boolean(row.rsvped),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toPark(row: any): Park {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    lat: Number(row.lat),
    lng: Number(row.lng),
    hours: row.hours,
    amenities: row.amenities ?? [],
    imageUrl: pickImage(row.image_id, row.image_url),
    distanceKm: round1(row.distance_km),
    dogsNow: Number(row.dogs_now ?? 0),
    checkedIn: Boolean(row.checked_in),
  };
}

/** `items` are order_items rows joined with seller_name, seller_avatar and product image columns. */
export function toOrder(row: any, items: any[]): Order {
  return {
    id: row.id,
    buyer: { ...summary(row.buyer_id, row.buyer_name, row.buyer_avatar), email: row.buyer_email },
    status: row.status,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      title: item.title,
      imageUrl: item.product_image_ids?.[0] ? imageUrl(item.product_image_ids[0]) : item.product_image_url ?? null,
      unitPaise: item.unit_paise,
      quantity: item.quantity,
      seller: summary(item.seller_id, item.seller_name, item.seller_avatar),
      fulfilment: item.fulfilment,
    })),
    subtotalPaise: row.subtotal_paise,
    shippingPaise: row.shipping_paise,
    totalPaise: row.total_paise,
    shippingAddress: row.shipping_address,
    placedAt: iso(row.placed_at),
    paidAt: iso(row.paid_at),
    updatedAt: iso(row.updated_at),
  };
}
