/**
 * Runs once after the whole suite (playwright.config.ts `globalTeardown`): let
 * the next run have the database. The rows stay — a finished run's data is what
 * a failure is read from — only the lock goes.
 */
import { releaseSuiteLock } from "./suite-lock";

export default async function globalTeardown(): Promise<void> {
  releaseSuiteLock();
}
