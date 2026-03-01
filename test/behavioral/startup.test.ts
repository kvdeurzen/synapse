import { describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { withFixture, fixtureExists, readFixture } from "./fixture-loader";

describe("Behavioral: startup fixture pattern", () => {
	test("withFixture returns cached data on replay", async () => {
		// This test uses a pre-committed fixture to demonstrate replay
		// The fixture simulates what a real startup sequence would return
		const result = await withFixture(
			"test-startup-replay",
			async () => {
				// This live call only runs when the fixture does not exist
				return {
					active_epics: [] as string[],
					recent_decisions: [] as string[],
					project_status: "no active work streams",
				};
			},
		);

		expect(result).toBeDefined();
		expect(result).toHaveProperty("project_status");
		// Verify we got the cached version (replay mode)
		expect(result.project_status).toBe("no active work streams");
	});

	test("withFixture records new fixture when missing", async () => {
		const testName = `test-record-${Date.now()}`;
		const result = await withFixture(testName, async () => {
			return { recorded: true, timestamp: new Date().toISOString() };
		});

		expect(result.recorded).toBe(true);
		expect(fixtureExists(testName)).toBe(true);

		// Verify the fixture was written to disk by reading it back
		const fromDisk = readFixture<{ recorded: boolean; timestamp: string }>(testName);
		expect(fromDisk?.recorded).toBe(true);

		// Clean up the test-generated fixture
		const fixturePath = join(import.meta.dir, "fixtures", `${testName}.json`);
		unlinkSync(fixturePath);
		expect(fixtureExists(testName)).toBe(false);
	});

	test("readFixture returns null for missing fixture", () => {
		const result = readFixture("nonexistent-fixture");
		expect(result).toBeNull();
	});

	test("fixtureExists returns true for committed fixture", () => {
		// The test-startup-replay fixture is pre-committed
		expect(fixtureExists("test-startup-replay")).toBe(true);
	});

	test("withFixture replays from disk without calling live function", async () => {
		let liveCallCount = 0;
		const result = await withFixture("test-startup-replay", async () => {
			liveCallCount++;
			return { live: true };
		});
		// Live function should NOT have been called (fixture exists)
		expect(liveCallCount).toBe(0);
		// Should return the cached fixture data
		expect(result).toHaveProperty("project_status");
	});
});
