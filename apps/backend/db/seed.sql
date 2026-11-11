-- =====================================================================
-- Proot — demo data (optional)
-- ---------------------------------------------------------------------
-- Fills a fresh database with sample sellers, care providers, parks, events
-- and nearby dogs around Bengaluru so every screen has something to show.
-- Safe to run more than once (fixed ids + ON CONFLICT DO NOTHING).
--
-- Apply with:  npm run db:seed
--         or:  psql "$DATABASE_URL" -f apps/backend/db/seed.sql
--
-- Every demo account below uses the password:  proot-demo-123
-- Do NOT load this file into a production database.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Demo accounts
-- ---------------------------------------------------------------------
INSERT INTO users (id, email, password_hash, name, role, phone, city, lat, lng) VALUES
  ('00000000-0000-4000-8000-000000000001', 'store@proot.demo',   '$2a$11$qLWYslVniTEUz3EOvxp2deq4tSfZb/QnQUt.x.IDaRBnI.wNswLoC', 'Proot Store',  'USER',          '+91 80000 00001', 'Bengaluru', 12.9716, 77.5946),
  ('00000000-0000-4000-8000-000000000002', 'asha@proot.demo',    '$2a$11$qLWYslVniTEUz3EOvxp2deq4tSfZb/QnQUt.x.IDaRBnI.wNswLoC', 'Asha K.',      'PROVIDER',      '+91 80000 00002', 'Bengaluru', 12.9784, 77.6408),
  ('00000000-0000-4000-8000-000000000003', 'leo@proot.demo',     '$2a$11$qLWYslVniTEUz3EOvxp2deq4tSfZb/QnQUt.x.IDaRBnI.wNswLoC', 'Leo M.',       'PROVIDER',      '+91 80000 00003', 'Bengaluru', 12.9352, 77.6245),
  ('00000000-0000-4000-8000-000000000004', 'nair@proot.demo',    '$2a$11$qLWYslVniTEUz3EOvxp2deq4tSfZb/QnQUt.x.IDaRBnI.wNswLoC', 'Dr. Nair',     'PROVIDER',      '+91 80000 00004', 'Bengaluru', 12.9299, 77.5826),
  ('00000000-0000-4000-8000-000000000005', 'priya@proot.demo',   '$2a$11$qLWYslVniTEUz3EOvxp2deq4tSfZb/QnQUt.x.IDaRBnI.wNswLoC', 'Priya S.',     'PROVIDER',      '+91 80000 00005', 'Bengaluru', 12.9698, 77.7500),
  ('00000000-0000-4000-8000-000000000006', 'rohan@proot.demo',   '$2a$11$qLWYslVniTEUz3EOvxp2deq4tSfZb/QnQUt.x.IDaRBnI.wNswLoC', 'Rohan P.',     'PROVIDER',      '+91 80000 00006', 'Bengaluru', 13.0358, 77.5970),
  ('00000000-0000-4000-8000-000000000007', 'events@proot.demo',  '$2a$11$qLWYslVniTEUz3EOvxp2deq4tSfZb/QnQUt.x.IDaRBnI.wNswLoC', 'Meera (Events)','EVENT_MANAGER', '+91 80000 00007', 'Bengaluru', 12.9716, 77.5946),
  ('00000000-0000-4000-8000-000000000008', 'otto@proot.demo',    '$2a$11$qLWYslVniTEUz3EOvxp2deq4tSfZb/QnQUt.x.IDaRBnI.wNswLoC', 'Karan',        'USER',          '+91 80000 00008', 'Bengaluru', 12.9750, 77.6000),
  ('00000000-0000-4000-8000-000000000009', 'kiki@proot.demo',    '$2a$11$qLWYslVniTEUz3EOvxp2deq4tSfZb/QnQUt.x.IDaRBnI.wNswLoC', 'Ananya',       'USER',          '+91 80000 00009', 'Bengaluru', 12.9800, 77.6100),
  ('00000000-0000-4000-8000-000000000010', 'bruno@proot.demo',   '$2a$11$qLWYslVniTEUz3EOvxp2deq4tSfZb/QnQUt.x.IDaRBnI.wNswLoC', 'Dev',          'USER',          '+91 80000 00010', 'Bengaluru', 12.9650, 77.6050)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Marketplace listings (prices in paise: 304000 = ₹3,040)
-- ---------------------------------------------------------------------
INSERT INTO products (id, seller_id, title, description, category, condition, price_paise, stock, image_url, city, lat, lng) VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Stoneware slow bowl', 'Weighted ceramic. Makes dinner last a little longer.', 'Home', 'New', 304000, 25,
   'https://images.unsplash.com/photo-1589924691995-400dc9f6438e?auto=format&fit=crop&w=1200&q=80', 'Bengaluru', 12.9716, 77.5946),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Hemp leash, 2m', 'Soft in the hand. No plastic hardware.', 'Accessories', 'New', 336000, 40,
   'https://images.unsplash.com/photo-1601758125946-6ec2e1c4e0d2?auto=format&fit=crop&w=1200&q=80', 'Bengaluru', 12.9716, 77.5946),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Felted wool nest', 'Machine washable. Holds shape after years of naps.', 'Home', 'New', 1024000, 8,
   'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&q=80', 'Bengaluru', 12.9716, 77.5946),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Olive wood chew', 'Naturally antibacterial. For focused chewing.', 'Toys', 'New', 144000, 60,
   'https://images.unsplash.com/photo-1534361960057-19889db9621e?auto=format&fit=crop&w=1200&q=80', 'Bengaluru', 12.9716, 77.5946),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'Daily kibble, salmon (4 kg)', 'Single protein. No fillers.', 'Food', 'New', 432000, 30,
   'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&w=1200&q=80', 'Bengaluru', 12.9716, 77.5946),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', 'Waxed rain coat', 'Cuts the wind. Dries on a hook.', 'Care', 'New', 512000, 12,
   'https://images.unsplash.com/photo-1544568100-847a948890b0?auto=format&fit=crop&w=1200&q=80', 'Bengaluru', 12.9716, 77.5946),
  ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000009', 'Travel crate (medium), barely used', 'Airline-approved, folds flat. Kiki outgrew it.', 'Accessories', 'Like new', 250000, 1,
   'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=1200&q=80', 'Bengaluru', 12.9800, 77.6100)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Care services
-- ---------------------------------------------------------------------
INSERT INTO care_services (id, provider_id, title, category, description, price_paise, duration_min, image_url, city, lat, lng, rating_avg, rating_count) VALUES
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Morning neighbourhood walk', 'Walk', 'Same route your dog already knows. Photo at the park gate.', 44000, 30,
   'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&q=80', 'Bengaluru', 12.9784, 77.6408, 4.9, 214),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'Bath + tidy trim at home', 'Groom', 'They bring the tub. You keep the floors.', 160000, 75,
   'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=1200&q=80', 'Bengaluru', 12.9352, 77.6245, 4.8, 91),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004', 'At-home wellness check', 'Vet', 'Weight, coat, teeth, and a quiet exam on the rug.', 220000, 40,
   'https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def?auto=format&fit=crop&w=1200&q=80', 'Bengaluru', 12.9299, 77.5826, 5.0, 48),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005', 'Loose-leash lesson', 'Train', 'One skill. Practised on your actual block.', 110000, 50,
   'https://images.unsplash.com/photo-1551717743-49959800b1f6?auto=format&fit=crop&w=1200&q=80', 'Bengaluru', 12.9698, 77.7500, 4.9, 132),
  ('20000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006', 'Evening sit', 'Sit', 'Dinner, a short walk, and a note when you get home.', 78000, 120,
   'https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=1200&q=80', 'Bengaluru', 13.0358, 77.5970, 4.7, 66)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Parks (real Bengaluru locations)
-- ---------------------------------------------------------------------
INSERT INTO parks (id, name, description, address, lat, lng, hours, amenities, image_url) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Cubbon south lawn', 'Wide shaded lawn near the bandstand. Busy at dawn.', 'Cubbon Park, Kasturba Road', 12.9763, 77.5929, '6:00–8:30 · 17:00–19:00', ARRAY['Water', 'Shade', 'Bins'],
   'https://images.unsplash.com/photo-1508672019048-805c876b67e2?auto=format&fit=crop&w=1400&q=80'),
  ('30000000-0000-4000-8000-000000000002', 'Ulsoor lake edge', 'Flat loop path around the lake with benches.', 'Ulsoor Lake, Halasuru', 12.9830, 77.6200, 'Dawn to dusk', ARRAY['Loop path', 'Benches'],
   'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1400&q=80'),
  ('30000000-0000-4000-8000-000000000003', 'Sankey patch', 'Small fenced patch by the tank. Good for shy dogs.', 'Sankey Tank, Malleswaram', 13.0098, 77.5738, '6:00–20:00', ARRAY['Fenced', 'Water'],
   'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1400&q=80'),
  ('30000000-0000-4000-8000-000000000004', 'Lalbagh west gate lawn', 'Quiet lawns inside the west gate; leash on the paths.', 'Lalbagh Botanical Garden', 12.9507, 77.5848, '6:00–9:00 · 16:00–18:30', ARRAY['Shade', 'Bins', 'Benches'],
   'https://images.unsplash.com/photo-1500964757637-c85e8a162699?auto=format&fit=crop&w=1400&q=80')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Events (dates are relative to when you run this file)
-- ---------------------------------------------------------------------
INSERT INTO events (id, title, description, location, lat, lng, starts_at, capacity, published, image_url, manager_id) VALUES
  ('40000000-0000-4000-8000-000000000001', 'Sunday meadow meetup', 'Off-leash hour for dogs who already play well. Coffee for humans.', 'Riverside Lawn, Indiranagar', 12.9784, 77.6408,
   date_trunc('day', now()) + interval '4 days 3 hours', 18, true, 'https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=1400&q=80', '00000000-0000-4000-8000-000000000007'),
  ('40000000-0000-4000-8000-000000000002', 'Quiet adoption hour', 'Meet two adult dogs. No crowds. Sit on the floor.', 'Proot Studio, Koramangala', 12.9352, 77.6245,
   date_trunc('day', now()) + interval '6 days 10 hours 30 minutes', 12, true, 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=1400&q=80', '00000000-0000-4000-8000-000000000007'),
  ('40000000-0000-4000-8000-000000000003', 'Agility, first time', 'Low jumps. Lots of treats. Leave if it is too much.', 'District Yard, Jayanagar', 12.9299, 77.5826,
   date_trunc('day', now()) + interval '9 days 13 hours', 8, true, 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=1400&q=80', '00000000-0000-4000-8000-000000000007')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Nearby dogs (for Friends)
-- ---------------------------------------------------------------------
INSERT INTO pets (id, user_id, name, breed, sex, birth_date, weight_kg, neutered, vaccinations, diet_type, meals_per_day, activity_level, temperament, social, bio, prompt, answer) VALUES
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000008', 'Otto', 'Beagle', 'Male', (now() - interval '2 years')::date, 12, true, ARRAY['Rabies', 'DHPP'], 'Kibble', 2, 'High',
   ARRAY['Playful', 'Curious'], 'Loves dogs', 'Follows his nose everywhere. Will share a stick, eventually.', 'You’ll win me over with…', 'A stick. Any stick. Ideally yours.'),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000009', 'Kiki', 'Indie', 'Female', (now() - interval '4 years')::date, 16, true, ARRAY['Rabies', 'DHPP', 'Leptospirosis'], 'Home-cooked', 2, 'Moderate',
   ARRAY['Shy', 'Cuddly'], 'Selective', 'Takes a minute to warm up, then never leaves your side.', 'My perfect Sunday is…', 'Long sniff walk, then a nap in the one patch of sun.'),
  ('50000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000010', 'Bruno', 'Golden Retriever', 'Male', (now() - interval '5 years')::date, 30, true, ARRAY['Rabies', 'DHPP'], 'Mixed', 2, 'Moderate',
   ARRAY['Calm', 'Gentle with kids'], 'Loves dogs', 'Big, soft, slightly lazy. Great with puppies.', 'I’m secretly afraid of…', 'The vacuum cleaner, and very small cats.')
ON CONFLICT (id) DO NOTHING;

COMMIT;
