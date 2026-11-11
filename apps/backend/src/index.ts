import { createServer } from 'node:http';
import { createApp } from './app.js';
import { bootstrapAdminFromEnv } from './bootstrap.js';
import { aiEnabled, appConfig, paymentsEnabled } from './config.js';
import { checkDatabase, pool } from './db.js';
import { startJobs } from './jobs.js';
import { attachRealtime } from './lib/realtime.js';

await checkDatabase();
await bootstrapAdminFromEnv();

const server = createServer(createApp());
attachRealtime(server);
startJobs();

server.listen(appConfig.port, () => {
  console.log(`Proot backend listening on http://localhost:${appConfig.port}`);
  if (!paymentsEnabled()) console.warn('  · Payments are off: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
  if (!aiEnabled()) console.warn('  · AI meal analysis is off: set ANTHROPIC_API_KEY in .env (the built-in estimate is used)');
});

const shutdown = () => {
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
