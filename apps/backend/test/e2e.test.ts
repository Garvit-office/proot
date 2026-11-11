/**
 * End-to-end API test. Runs every feature against a live backend over HTTP + Socket.IO.
 *
 *   1. Point a backend at a THROWAWAY database (this test creates users, orders, …):
 *        DATABASE_URL=postgres://…/proot_test RAZORPAY_KEY_ID=rzp_test_x RAZORPAY_KEY_SECRET=testsecret \
 *        RAZORPAY_WEBHOOK_SECRET=whsecret RAZORPAY_OFFLINE_TEST=true \
 *        ADMIN_EMAIL=admin@test.dev ADMIN_PASSWORD=admin-pass-123 npm run dev -w backend
 *      (after `npm run db:migrate` and `npm run db:seed` on that database)
 *   2. API_URL=http://localhost:4000/api RAZORPAY_KEY_SECRET=testsecret RAZORPAY_WEBHOOK_SECRET=whsecret npm run test:e2e -w backend
 */
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { ApiRequestError, connectRealtime, createApiClient, type ApiClient, type ServerEvents } from '@proot/shared';

const API = process.env.API_URL ?? 'http://localhost:4000/api';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? 'testsecret';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? 'whsecret';
const ADMIN = { email: process.env.TEST_ADMIN_EMAIL ?? 'admin@test.dev', password: process.env.TEST_ADMIN_PASSWORD ?? 'admin-pass-123' };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const run = randomUUID().slice(0, 8);

type Session = { api: ApiClient; token: string; id: string; email: string };
const sockets: ReturnType<typeof connectRealtime>[] = [];

function client(token: string | null) {
  return createApiClient({ baseUrl: API, getToken: () => token });
}

async function signUp(name: string): Promise<Session> {
  const email = `${name.toLowerCase()}-${run}@test.dev`;
  const res = await client(null).register({ name, email, password: 'password-123' });
  return { api: client(res.token), token: res.token, id: res.user.id, email };
}

async function signIn(email: string, password: string): Promise<Session> {
  const res = await client(null).login({ email, password });
  return { api: client(res.token), token: res.token, id: res.user.id, email };
}

async function rejects(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ApiRequestError, `expected ApiRequestError, got ${error}`);
    assert.equal(error.status, status, `expected ${status}, got ${error.status}: ${error.message}`);
    return true;
  });
}

/** Resolve with the first payload of `event` matching `match`, or fail after a timeout. */
function nextEvent<E extends keyof ServerEvents>(socket: ReturnType<typeof connectRealtime>, event: E, match: (p: Parameters<ServerEvents[E]>[0]) => boolean = () => true, ms = 4000) {
  return new Promise<Parameters<ServerEvents[E]>[0]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${String(event)}`)), ms);
    const handler = (payload: any) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      (socket as any).off(event, handler);
      resolve(payload);
    };
    (socket as any).on(event, handler);
  });
}

async function connect(session: Session) {
  const socket = connectRealtime(API, () => session.token);
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

const sign = (orderId: string, paymentId: string) => createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

const petInput = (name: string) => ({
  name, photo: PNG, breed: 'Indie', sex: 'Female' as const, birthDate: '2021-03-01', birthDateApprox: false, weightKg: 18, neutered: true,
  vaccinations: ['Rabies'], allergies: '', conditions: '', vetName: '', vetPhone: '', microchipId: '', dietType: 'Kibble' as const,
  mealsPerDay: 2, activityLevel: 'Moderate' as const, temperament: ['Playful'], social: 'Loves dogs' as const, bio: 'Hello', prompt: '', answer: '',
});

const address = { fullName: 'Buyer One', phone: '+91 98765 43210', line1: '12 MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' };

let admin: Session;
let buyer: Session;
let seller: Session;

before(async () => {
  admin = await signIn(ADMIN.email, ADMIN.password);
  buyer = await signUp('Buyer');
  seller = await signUp('Seller');
});

after(() => sockets.forEach((s) => s.close()));

describe('auth and authorisation', () => {
  test('rejects bad credentials, duplicates and weak passwords', async () => {
    await rejects(client(null).login({ email: buyer.email, password: 'wrong-password' }), 401);
    await rejects(client(null).register({ name: 'Dup', email: buyer.email, password: 'password-123' }), 409);
    await rejects(client(null).register({ name: 'Weak', email: `weak-${run}@test.dev`, password: 'short' }), 400);
  });

  test('requires a token and checks roles against the database', async () => {
    await rejects(client(null).listPets(), 401);
    await rejects(client('not-a-jwt').me(), 401);
    await rejects(buyer.api.adminStats(), 403);
    await rejects(buyer.api.createService({ title: 'Walks', category: 'Walk', description: '', pricePaise: 50000, durationMin: 30 }), 403);
    const me = await buyer.api.me();
    assert.equal(me.role, 'USER');
    assert.equal(me.onboarded, false);
  });

  test('profile and location are saved', async () => {
    const me = await buyer.api.updateProfile({ phone: '+91 98765 43210', city: 'Bengaluru' });
    assert.equal(me.phone, '+91 98765 43210');
    const located = await buyer.api.updateLocation({ lat: 12.9716, lng: 77.5946 });
    assert.equal(located.lat, 12.9716);
    await seller.api.updateLocation({ lat: 12.98, lng: 77.6 });
  });
});

let buyerPetId = '';
let sellerPetId = '';

describe('pets and images', () => {
  test('creates a pet with a stored photo, private to its owner', async () => {
    const pet = await buyer.api.createPet(petInput('Maple'));
    buyerPetId = pet.id;
    assert.match(pet.photo ?? '', /\/api\/images\/[0-9a-f-]{36}$/);
    const image = await fetch(pet.photo!);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    await rejects(seller.api.getPet(pet.id), 404);
    assert.equal((await buyer.api.me()).onboarded, true);
    // Keeping the existing photo URL on update must not create a new image.
    const updated = await buyer.api.updatePet(pet.id, { ...petInput('Maple'), photo: pet.photo });
    assert.equal(updated.photo, pet.photo);
    sellerPetId = (await seller.api.createPet(petInput('Pepper'))).id;
  });

  test('rejects files that are not images', async () => {
    await rejects(buyer.api.uploadImage('data:image/png;base64,' + Buffer.from('not an image at all').toString('base64')), 400);
  });
});

let productId = '';

describe('marketplace, cart, checkout and payments', () => {
  test('sellers list items; others cannot edit them', async () => {
    const product = await seller.api.createProduct({ title: `Rope toy ${run}`, description: 'Cotton rope', category: 'Toys', condition: 'New', pricePaise: 50000, stock: 3, status: 'ACTIVE', images: [PNG] });
    productId = product.id;
    assert.equal(product.images.length, 1);
    await rejects(buyer.api.updateProduct(product.id, { pricePaise: 100 }), 403);
    const found = await buyer.api.listProducts({ q: `Rope toy ${run}`, sort: 'distance' });
    assert.equal(found.items[0]?.id, product.id);
    assert.ok(found.items[0].distanceKm !== null && found.items[0].distanceKm < 5);
  });

  test('cart enforces stock and ownership', async () => {
    await rejects(seller.api.setCartItem(productId, 1), 400);
    await rejects(buyer.api.setCartItem(productId, 5), 400);
    const cart = await buyer.api.setCartItem(productId, 2);
    assert.equal(cart.count, 2);
    assert.equal(cart.subtotalPaise, 100000);
    assert.equal(cart.shippingPaise, 0); // ≥ ₹999 ships free
  });

  test('checkout reserves stock; a verified Razorpay payment marks the order paid in real time', async () => {
    const buyerSocket = await connect(buyer);
    const sellerSocket = await connect(seller);
    const stockEvent = nextEvent(buyerSocket, 'product:updated', (p) => p.id === productId);

    const { order, payment } = await buyer.api.checkout({ address, saveAddress: true });
    assert.equal(order.status, 'PENDING_PAYMENT');
    assert.equal(payment.amountPaise, 100000);
    assert.equal((await stockEvent).stock, 1);
    assert.equal((await buyer.api.getCart()).count, 0);
    assert.equal((await buyer.api.listAddresses()).length, 1);

    await rejects(buyer.api.verifyPayment({ razorpayOrderId: payment.razorpayOrderId, razorpayPaymentId: 'pay_x', razorpaySignature: 'f'.repeat(64) }), 400);
    await rejects(seller.api.verifyPayment({ razorpayOrderId: payment.razorpayOrderId, razorpayPaymentId: 'pay_x', razorpaySignature: sign(payment.razorpayOrderId, 'pay_x') }), 404);

    const paid = nextEvent(buyerSocket, 'order:updated', (o) => o.id === order.id && o.status === 'PAID');
    const sale = nextEvent(sellerSocket, 'notification', (n) => n.type === 'order.new_sale');
    const result = await buyer.api.verifyPayment({ razorpayOrderId: payment.razorpayOrderId, razorpayPaymentId: `pay_${run}a`, razorpaySignature: sign(payment.razorpayOrderId, `pay_${run}a`) });
    assert.equal(result.status, 'PAID');
    await paid;
    await sale;

    // The seller ships and delivers; the order status follows.
    const selling = await seller.api.listSellingOrders();
    const mine = selling.find((o) => o.id === order.id)!;
    assert.equal(mine.items.length, 1);
    const shipped = await seller.api.updateOrderItem(order.id, mine.items[0].id, 'SHIPPED');
    assert.equal(shipped.status, 'SHIPPED');
    await rejects(buyer.api.cancelOrder(order.id), 409);
    const delivered = await seller.api.updateOrderItem(order.id, mine.items[0].id, 'DELIVERED');
    assert.equal(delivered.status, 'DELIVERED');
  });

  test('the Razorpay webhook confirms payments and rejects bad signatures', async () => {
    await buyer.api.setCartItem(productId, 1);
    const { order, payment } = await buyer.api.checkout({ addressId: (await buyer.api.listAddresses())[0].id });
    assert.equal(order.shippingPaise, 4900); // below ₹999 pays shipping
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_${run}b`, order_id: payment.razorpayOrderId } } } });
    const bad = await fetch(`${API}/payments/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': 'nope' }, body });
    assert.equal(bad.status, 400);
    const good = await fetch(`${API}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex') },
      body,
    });
    assert.equal(good.status, 200);
    assert.equal((await buyer.api.getOrder(order.id)).status, 'PAID');
    // Listing is now sold out.
    assert.equal((await buyer.api.getProduct(productId)).status, 'SOLD_OUT');
  });

  test('cancelling a paid order refunds it and restores stock', async () => {
    const orders = await buyer.api.listOrders();
    const paid = orders.find((o) => o.status === 'PAID')!;
    const cancelled = await buyer.api.cancelOrder(paid.id);
    assert.equal(cancelled.status, 'REFUNDED');
    const product = await buyer.api.getProduct(productId);
    assert.equal(product.status, 'ACTIVE');
    assert.equal(product.stock, 1);
  });

  test('the hosted checkout page renders for its token only', async () => {
    await buyer.api.setCartItem(productId, 1);
    const { payment } = await buyer.api.checkout({ address });
    const page = await fetch(payment.checkoutUrl);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /checkout\.razorpay\.com/);
    const forged = await fetch(payment.checkoutUrl.replace(/t=[^&]+/, 't=forged'));
    assert.equal(forged.status, 401);
  });
});

describe('care services and bookings', () => {
  let provider: Session;
  let serviceId = '';

  test('admins grant the provider role; providers list services', async () => {
    provider = await signUp('Provider');
    await admin.api.setUserRole(provider.id, 'PROVIDER');
    const service = await provider.api.createService({ title: `Dog walk ${run}`, category: 'Walk', description: 'Around the block', pricePaise: 45000, durationMin: 60, lat: 12.97, lng: 77.59 });
    serviceId = service.id;
    await rejects(seller.api.updateService(service.id, { pricePaise: 100 }), 403);
  });

  test('booking a slot, paying, double-booking protection, confirm and decline with refund', async () => {
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const { slots } = await buyer.api.getSlots(serviceId, tomorrow);
    assert.ok(slots.length > 4, 'expected open slots tomorrow');

    const providerSocket = await connect(provider);
    const { booking, payment } = await buyer.api.createBooking({ serviceId, petId: buyerPetId, startsAt: slots[0], address: '12 MG Road, Bengaluru' });
    assert.equal(booking.status, 'REQUESTED');
    await rejects(seller.api.createBooking({ serviceId, petId: sellerPetId, startsAt: slots[0], address: 'Somewhere else 1' }), 409);
    assert.equal((await provider.api.listProviderBookings()).length, 0, 'unpaid requests are hidden from providers');

    const request = nextEvent(providerSocket, 'notification', (n) => n.type === 'booking.request');
    await buyer.api.verifyPayment({ razorpayOrderId: payment.razorpayOrderId, razorpayPaymentId: `pay_${run}c`, razorpaySignature: sign(payment.razorpayOrderId, `pay_${run}c`) });
    await request;
    assert.equal((await buyer.api.getSlots(serviceId, tomorrow)).slots.includes(slots[0]), false);

    await rejects(buyer.api.setBookingStatus(booking.id, 'CONFIRMED'), 409);
    const confirmed = await provider.api.setBookingStatus(booking.id, 'CONFIRMED');
    assert.equal(confirmed.status, 'CONFIRMED');
    await rejects(provider.api.setBookingStatus(booking.id, 'COMPLETED'), 409); // hasn't started yet

    const second = await buyer.api.createBooking({ serviceId, petId: buyerPetId, startsAt: slots[3], address: '12 MG Road, Bengaluru' });
    await buyer.api.verifyPayment({ razorpayOrderId: second.payment.razorpayOrderId, razorpayPaymentId: `pay_${run}d`, razorpaySignature: sign(second.payment.razorpayOrderId, `pay_${run}d`) });
    const declined = await provider.api.setBookingStatus(second.booking.id, 'DECLINED');
    assert.equal(declined.status, 'DECLINED');
    await rejects(buyer.api.reviewBooking(booking.id, { rating: 5 }), 409); // not completed yet
  });
});

describe('events', () => {
  test('managers publish; members RSVP up to capacity, with live counts', async () => {
    const manager = await signUp('Manager');
    await admin.api.setUserRole(manager.id, 'EVENT_MANAGER');
    const event = await manager.api.createEvent({ title: `Meetup ${run}`, description: 'Calm dogs only', location: 'Cubbon Park', startsAt: new Date(Date.now() + 3 * 864e5).toISOString(), capacity: 1, published: true, image: PNG });
    assert.ok(event.imageUrl);
    await rejects(buyer.api.updateEvent(event.id, { title: 'Hacked' }), 403);
    const socket = await connect(seller);
    const live = nextEvent(socket, 'event:updated', (p) => p.id === event.id);
    const rsvp = await buyer.api.rsvp(event.id);
    assert.equal(rsvp.rsvped, true);
    assert.equal((await live).rsvpCount, 1);
    await rejects(seller.api.rsvp(event.id), 409); // full
    const detail = await manager.api.getEvent(event.id);
    assert.equal(detail.attendees.length, 1);
    assert.equal((await buyer.api.getEvent(event.id)).attendees.length, 0, 'attendee list is private to managers');
  });
});

describe('parks', () => {
  test('check-in updates live presence; check-out logs the visit', async () => {
    const parks = await buyer.api.listParks();
    assert.ok(parks.length > 0);
    assert.ok(parks[0].distanceKm !== null, 'distance from saved location');
    const park = parks[0];
    const socket = await connect(seller);
    const presence = nextEvent(socket, 'park:presence', (p) => p.parkId === park.id);
    await buyer.api.checkIn(park.id, buyerPetId);
    assert.equal((await presence).dogsNow, park.dogsNow + 1);
    assert.equal((await buyer.api.getPark(park.id)).present.some((p) => p.petName === 'Maple'), true);
    assert.equal((await buyer.api.currentCheckin())?.parkId, park.id);
    await buyer.api.checkOut();
    assert.equal(await buyer.api.currentCheckin(), null);
    const activity = await buyer.api.listActivity(buyerPetId, { tzOffset: new Date().getTimezoneOffset() });
    assert.ok(activity.items.some((a) => a.type === 'Park'));
  });
});

describe('friends', () => {
  test('a mutual hello becomes a match with real-time chat', async () => {
    const discover = await buyer.api.discoverPets(buyerPetId);
    assert.ok(discover.some((p) => p.id === sellerPetId));
    const first = await buyer.api.greet({ fromPetId: buyerPetId, toPetId: sellerPetId, liked: true });
    assert.equal(first.matched, false);
    const pending = await seller.api.pendingGreetings();
    assert.ok(pending.incoming.some((p) => p.id === buyerPetId));

    const buyerSocket = await connect(buyer);
    const matchEvent = nextEvent(buyerSocket, 'match:new');
    const second = await seller.api.greet({ fromPetId: sellerPetId, toPetId: buyerPetId, liked: true });
    assert.equal(second.matched, true);
    const match = await matchEvent;
    assert.equal(match.theirPet.id, sellerPetId);

    const message = nextEvent(buyerSocket, 'message:new', (m) => m.matchId === match.id);
    await seller.api.sendMessage(match.id, 'Park at 7?');
    assert.equal((await message).body, 'Park at 7?');
    assert.equal((await buyer.api.listMatches())[0].unreadCount, 1);
    await buyer.api.markMatchRead(match.id);
    assert.equal((await buyer.api.listMatches())[0].unreadCount, 0);
    await rejects(admin.api.listMessages(match.id), 404);
    assert.equal((await buyer.api.discoverPets(buyerPetId)).some((p) => p.id === sellerPetId), false);
  });
});

describe('nutrition, activity and home', () => {
  test('meals are analysed, saved and totalled for the day', async () => {
    const byName = await buyer.api.analyzeMeal({ petId: buyerPetId, label: 'chicken and rice' });
    assert.equal(byName.analysis.verdict, 'Good');
    const toxic = await buyer.api.analyzeMeal({ petId: buyerPetId, label: 'leftover pizza with onion' });
    assert.equal(toxic.analysis.verdict, 'Skip');
    const withPhoto = await buyer.api.analyzeMeal({ petId: buyerPetId, photo: PNG, label: 'kibble' });
    assert.ok(withPhoto.imageId);
    const saved = await buyer.api.saveMeal({ ...withPhoto.analysis, petId: buyerPetId, source: withPhoto.source, imageId: withPhoto.imageId });
    assert.ok(saved.imageUrl);
    const day = await buyer.api.listMeals(buyerPetId, undefined, new Date().getTimezoneOffset());
    assert.equal(day.totalKcal, saved.kcal);
    assert.ok(day.targetKcal > 0);
    await rejects(seller.api.listMeals(buyerPetId), 404);
  });

  test('activities are logged and summarised', async () => {
    await buyer.api.logActivity({ petId: buyerPetId, type: 'Walk', title: 'Morning loop', distanceKm: 2.1, durationMin: 28 });
    const day = await buyer.api.listActivity(buyerPetId, { tzOffset: new Date().getTimezoneOffset() });
    assert.equal(day.summary.walkKm, 2.1);
    assert.ok(day.summary.kcalIn > 0);
    const home = await buyer.api.home(buyerPetId);
    assert.equal(home.today.walkKm, 2.1);
    assert.ok(home.nearestPark);
  });

  test('notifications are listed and marked read', async () => {
    const list = await buyer.api.listNotifications();
    assert.ok(list.items.length > 0);
    const { unread } = await buyer.api.markNotificationsRead();
    assert.equal(unread, 0);
  });
});

describe('admin and session revocation', () => {
  test('admin views stats, lists, moderates and deactivates', async () => {
    const stats = await admin.api.adminStats();
    assert.ok(stats.orders.paid >= 1);
    assert.ok(stats.bookings.total >= 2);
    assert.ok((await admin.api.adminUsers({ q: run })).total >= 3);
    assert.ok((await admin.api.adminOrders()).items.length > 0);
    assert.ok((await admin.api.adminBookings()).items.length > 0);
    assert.ok((await admin.api.adminAudit(20)).length > 0);
    const removed = await admin.api.setProductStatus(productId, 'REMOVED');
    assert.equal(removed.status, 'REMOVED');
    await rejects(buyer.api.getProduct(productId), 404);

    await admin.api.setUserActive(seller.id, false);
    await rejects(seller.api.me(), 401);
    await rejects(client(null).login({ email: seller.email, password: 'password-123' }), 403);
    await rejects(admin.api.setUserActive(admin.id, false), 400);
  });

  test('changing the password signs out other sessions', async () => {
    const { token } = await buyer.api.changePassword({ currentPassword: 'password-123', newPassword: 'password-456' });
    await rejects(buyer.api.me(), 401);
    assert.equal((await client(token).me()).id, buyer.id);
    await client(token).logoutEverywhere();
    await rejects(client(token).me(), 401);
  });
});
