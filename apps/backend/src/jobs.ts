import { expireUnpaidBookings } from './routes/care.js';
import { expireUnpaidOrders } from './routes/orders.js';
import { expireCheckins } from './routes/parks.js';

/** Periodic housekeeping: release stock from unpaid orders, free unpaid booking slots, close stale park check-ins. */
export function startJobs() {
  const run = async () => {
    for (const job of [expireUnpaidOrders, expireUnpaidBookings, expireCheckins]) {
      await job().catch((error) => console.error(`job ${job.name} failed:`, error.message));
    }
  };
  const timer = setInterval(run, 60_000);
  timer.unref();
  void run();
}
