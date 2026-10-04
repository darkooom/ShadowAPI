import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteTrafficStore } from "../src/index.js";

const directories: string[] = [];
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })),
);

describe("SqliteTrafficStore", () => {
  it("round trips exchanges", async () => {
    const directory = mkdtempSync(join(tmpdir(), "shadowapi-"));
    directories.push(directory);
    const store = new SqliteTrafficStore(join(directory, "test.db"));
    await store.save({
      id: "one",
      timestamp: "2026-01-01T00:00:00.000Z",
      request: { method: "GET", pathname: "/users", query: {}, headers: {} },
      response: { status: 200, headers: {}, body: [] },
      durationMs: 12,
    });
    expect(await store.list()).toHaveLength(1);
    store.close();
  });
});
