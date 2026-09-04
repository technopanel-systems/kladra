/** `npm run db:create-test` — see scripts/test-database.ts. */
import { ensureTestDatabase } from "./test-database";

try {
  await ensureTestDatabase();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
