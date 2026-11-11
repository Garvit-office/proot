import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { appConfig, aiEnabled, paymentsEnabled } from './config.js';
import { requestContext } from './lib/context.js';
import { corsOriginCheck } from './lib/cors.js';
import { errorHandler } from './lib/http.js';
import { activitiesRouter } from './routes/activities.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { careRouter } from './routes/care.js';
import { cartRouter } from './routes/cart.js';
import { eventsRouter } from './routes/events.js';
import { friendsRouter } from './routes/friends.js';
import { mealsRouter } from './routes/meals.js';
import { miscRouter } from './routes/misc.js';
import { ordersRouter } from './routes/orders.js';
import { parksRouter } from './routes/parks.js';
import { paymentsRouter, webhookHandler } from './routes/payments.js';
import { petsRouter } from './routes/pets.js';
import { productsRouter } from './routes/products.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: corsOriginCheck }));
  app.use(morgan(appConfig.isProduction ? 'combined' : 'dev'));
  app.use(requestContext);

  // The webhook needs the raw body for its signature, so it is mounted before the JSON parser.
  app.post('/api/payments/webhook', ...webhookHandler);
  // Photos arrive as data URLs (product listings can carry several).
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'proot-backend', time: new Date().toISOString(), payments: paymentsEnabled(), ai: aiEnabled() });
  });

  for (const router of [authRouter, petsRouter, productsRouter, cartRouter, ordersRouter, paymentsRouter, careRouter, eventsRouter, parksRouter, friendsRouter, mealsRouter, activitiesRouter, miscRouter, adminRouter]) {
    app.use('/api', router);
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use(errorHandler);
  return app;
}
