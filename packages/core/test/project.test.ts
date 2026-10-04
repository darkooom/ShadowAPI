import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ShadowProject } from "../src/index.js";

const directories: string[] = [];
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })),
);

describe("ShadowProject", () => {
  it("creates and compares normalized snapshots", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "shadowapi-core-"));
    directories.push(cwd);
    const project = new ShadowProject({ cwd });
    await project.store.save({
      id: "one",
      timestamp: "2026-01-01T00:00:00Z",
      durationMs: 1,
      request: { method: "GET", pathname: "/users/123", query: {}, headers: {} },
      response: {
        status: 200,
        headers: { "content-type": "application/json" },
        contentType: "application/json",
        body: { id: "123" },
      },
    });
    const snapshot = await project.snapshot(new Date("2026-01-01T12:00:00Z"));
    expect(snapshot.model.endpoints[0]?.pathTemplate).toBe("/users/{id}");
    expect((await project.diff()).breaking).toHaveLength(0);
    project.close();
  });

  it("applies configured enum inference thresholds", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "shadowapi-core-"));
    directories.push(cwd);
    const project = new ShadowProject({
      cwd,
      config: {
        inference: {
          enum: {
            minimumObservations: 4,
            maximumUniqueValues: 2,
            maximumUniqueRatio: 0.5,
          },
        },
      },
    });

    for (let index = 0; index < 4; index += 1) {
      await project.store.save({
        id: `enum-${index}`,
        timestamp: "2026-01-01T00:00:00Z",
        durationMs: 1,
        request: { method: "GET", pathname: `/jobs/${index + 1}`, query: {}, headers: {} },
        response: {
          status: 200,
          headers: { "content-type": "application/json" },
          contentType: "application/json",
          body: { status: index % 2 === 0 ? "queued" : "running" },
        },
      });
    }

    const model = await project.model();
    expect(model.endpoints[0]?.responses[0]?.bodies[0]?.schema.properties?.status?.enum).toEqual([
      "queued",
      "running",
    ]);
    project.close();
  });

  it("diffs re-observed endpoints using only traffic recorded after the snapshot", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "shadowapi-core-"));
    directories.push(cwd);
    const project = new ShadowProject({ cwd });
    for (const [index, body] of [
      { id: "1", name: "Darko", active: true },
      { id: "2", name: "Anton", active: false },
    ].entries()) {
      await project.store.save({
        id: `baseline-${index}`,
        timestamp: `2026-01-01T00:00:0${index}.000Z`,
        durationMs: 1,
        request: { method: "GET", pathname: `/users/${index + 1}`, query: {}, headers: {} },
        response: {
          status: 200,
          headers: { "content-type": "application/json" },
          contentType: "application/json",
          body,
        },
      });
    }
    const snapshot = await project.snapshot();
    const changedAt = new Date(Date.parse(snapshot.model.generatedAt) + 1_000).toISOString();
    for (const [index, body] of [
      { id: 1, name: "Darko" },
      { id: 2, name: "Anton", nickname: "Tony" },
    ].entries()) {
      await project.store.save({
        id: `changed-${index}`,
        timestamp: changedAt,
        durationMs: 1,
        request: { method: "GET", pathname: `/users/${index + 1}`, query: {}, headers: {} },
        response: {
          status: 200,
          headers: { "content-type": "application/json" },
          contentType: "application/json",
          body,
        },
      });
    }
    await project.store.save({
      id: "new-endpoint",
      timestamp: changedAt,
      durationMs: 1,
      request: { method: "GET", pathname: "/status", query: {}, headers: {} },
      response: {
        status: 200,
        headers: { "content-type": "application/json" },
        contentType: "application/json",
        body: { status: "ok" },
      },
    });

    const result = await project.diff();
    expect(result.breaking.map((change) => change.message)).toEqual(
      expect.arrayContaining([
        "response field removed: active",
        "response field type changed: id (string → integer)",
      ]),
    );
    expect(result.nonBreaking.map((change) => change.message)).toEqual(
      expect.arrayContaining(["response field added: nickname", "endpoint added"]),
    );
    project.close();
  });
});
