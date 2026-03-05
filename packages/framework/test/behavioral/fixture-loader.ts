import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");

/**
 * Load a fixture from disk if it exists (replay mode).
 * If the fixture does not exist, call the live function, save the result as JSON, and return it (record mode).
 *
 * Usage:
 *   const result = await withFixture('my-test-case', async () => {
 *     return await expensiveLiveCall();
 *   });
 *
 * Fixtures are committed to git for deterministic replay.
 * Delete a fixture file to re-record it on next run.
 * Run `rm -rf test/behavioral/fixtures/ && bun test test/behavioral/` to re-record all.
 */
export async function withFixture<T>(name: string, liveCall: () => Promise<T>): Promise<T> {
  const fixturePath = join(FIXTURES_DIR, `${name}.json`);

  if (existsSync(fixturePath)) {
    // Replay mode — return cached result, no live call
    return JSON.parse(readFileSync(fixturePath, "utf-8")) as T;
  }

  // Record mode — call live function, cache result
  mkdirSync(dirname(fixturePath), { recursive: true });
  const result = await liveCall();
  writeFileSync(fixturePath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

/**
 * Check if a fixture exists (for conditional test logic).
 */
export function fixtureExists(name: string): boolean {
  return existsSync(join(FIXTURES_DIR, `${name}.json`));
}

/**
 * Read a fixture directly (for scorecard evaluation).
 */
export function readFixture<T>(name: string): T | null {
  const fixturePath = join(FIXTURES_DIR, `${name}.json`);
  if (!existsSync(fixturePath)) return null;
  return JSON.parse(readFileSync(fixturePath, "utf-8")) as T;
}
