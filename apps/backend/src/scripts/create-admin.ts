// Usage: npm run create-admin -w backend -- --email you@example.com [--password '...'] [--name 'Your Name']
// Creates the account as ADMIN, or promotes an existing account (its password is left alone).
import { parseArgs } from 'node:util';
import { ensureAdmin } from '../bootstrap.js';

const { values } = parseArgs({
  options: { email: { type: 'string' }, password: { type: 'string' }, name: { type: 'string' } },
});

if (!values.email) {
  console.error("Usage: npm run create-admin -w backend -- --email you@example.com [--password '...'] [--name 'Your Name']");
  process.exit(1);
}

try {
  const result = ensureAdmin({ email: values.email, password: values.password, name: values.name });
  console.log({ created: `Created admin ${values.email}.`, promoted: `Promoted ${values.email} to ADMIN.`, unchanged: `${values.email} is already an ADMIN.` }[result]);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
