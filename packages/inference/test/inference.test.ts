import { describe, expect, it } from "vitest";
import type { RecordedExchange } from "@shadowapi/shared";
import { buildApiModel, DeterministicSchemaInferenceEngine, normalizePath } from "../src/index.js";

function exchange(
  pathname: string,
  query: Record<string, string | string[]> = {},
  body: unknown = { ok: true },
): RecordedExchange {
  return {
    id: pathname + JSON.stringify(query) + JSON.stringify(body),
    timestamp: "2026-01-01T00:00:00.000Z",
    request: { method: "GET", pathname, query, headers: {} },
    response: {
      status: 200,
      headers: { "content-type": "application/json" },
      body,
      contentType: "application/json",
    },
    durationMs: 1,
  };
}

describe("path inference", () => {
  it("normalizes integer and uuid IDs", () => {
    expect(normalizePath("/users/123").template).toBe("/users/{id}");
    expect(normalizePath("/projects/a8f8c20a-4590-42bd-ae37-d0d833a2ec71").template).toBe(
      "/projects/{id}",
    );
  });

  it("does not normalize known static words", () => {
    expect(normalizePath("/users/me").template).toBe("/users/me");
    expect(normalizePath("/users/search").template).toBe("/users/search");
    expect(normalizePath("/users/settings").template).toBe("/users/settings");
  });
});

describe("schema inference", () => {
  it("merges optional and nullable fields", () => {
    const engine = new DeterministicSchemaInferenceEngine();
    engine.observe({ id: "123", name: "Darko", active: true });
    engine.observe({ id: "456", name: "Anton", active: false, avatar: null });
    const schema = engine.schema();
    expect(schema.required).toEqual(["id", "name", "active"]);
    expect(schema.properties?.avatar?.type).toBe("null");
    expect(schema.properties?.active?.type).toBe("boolean");
    expect(schema.properties?.id?.enum).toBeUndefined();
    expect(schema.properties?.name?.enum).toBeUndefined();
    expect(schema.properties?.active?.enum).toBeUndefined();
  });

  it("merges nullable fields when both value shapes are observed", () => {
    const engine = new DeterministicSchemaInferenceEngine();
    engine.observe({ avatar: "https://example.com/a.jpg" });
    engine.observe({ avatar: null });
    expect(engine.schema().properties?.avatar?.type).toEqual(["string", "null"]);
  });

  it("does not infer enums for names, IDs or booleans", () => {
    const engine = new DeterministicSchemaInferenceEngine();
    for (let index = 0; index < 10; index += 1) {
      engine.observe({
        id: index % 2 === 0 ? "1" : "2",
        name: index % 2 === 0 ? "Darko" : "Anton",
        active: index % 2 === 0,
      });
    }

    const properties = engine.schema().properties;
    expect(properties?.id).toEqual({ type: "string" });
    expect(properties?.name).toEqual({ type: "string" });
    expect(properties?.active).toEqual({ type: "boolean" });
  });

  it("infers a repeated categorical enum after sufficient observations", () => {
    const engine = new DeterministicSchemaInferenceEngine();
    for (let index = 0; index < 10; index += 1) {
      engine.observe({ status: index % 2 === 0 ? "active" : "archived" });
    }

    expect(engine.schema().properties?.status).toEqual({
      type: "string",
      enum: ["active", "archived"],
    });
  });

  it("does not infer an enum before the minimum observation threshold", () => {
    const engine = new DeterministicSchemaInferenceEngine();
    for (let index = 0; index < 9; index += 1) {
      engine.observe({ status: index % 2 === 0 ? "active" : "archived" });
    }

    expect(engine.schema().properties?.status?.enum).toBeUndefined();
  });

  it("supports configurable enum thresholds", () => {
    const engine = new DeterministicSchemaInferenceEngine({
      enum: {
        minimumObservations: 5,
        maximumUniqueValues: 3,
        maximumUniqueRatio: 0.4,
      },
    });
    for (const status of ["active", "archived", "active", "archived", "active"])
      engine.observe({ status });

    expect(engine.schema().properties?.status?.enum).toEqual(["active", "archived"]);
  });

  it("never infers enums for formatted or opaque identifier strings", () => {
    const engine = new DeterministicSchemaInferenceEngine();
    for (let index = 0; index < 10; index += 1) {
      const alternate = index % 2 === 0;
      engine.observe({
        contact: alternate ? "darko@example.com" : "anton@example.com",
        website: alternate ? "https://example.com/darko" : "https://example.com/anton",
        owner: alternate
          ? "a8f8c20a-4590-42bd-ae37-d0d833a2ec71"
          : "7092a6c7-0fb5-4f42-b2d0-f11ca155f26f",
        object: alternate ? "507f1f77bcf86cd799439011" : "507f191e810c19729de860ea",
        event: alternate ? "01ARZ3NDEKTSV4RRFFQ69G5FAV" : "01BX5ZZKBKACTAV9WEVGEMMVS0",
      });
    }

    const properties = engine.schema().properties;
    expect(properties?.contact).toEqual({ type: "string", format: "email" });
    expect(properties?.website).toEqual({ type: "string", format: "uri" });
    expect(properties?.owner).toEqual({ type: "string", format: "uuid" });
    expect(properties?.object?.enum).toBeUndefined();
    expect(properties?.event?.enum).toBeUndefined();
  });

  it("keeps categorical enums nullable when null is observed", () => {
    const engine = new DeterministicSchemaInferenceEngine();
    for (let index = 0; index < 10; index += 1)
      engine.observe({ status: index % 2 === 0 ? "active" : "archived" });
    engine.observe({ status: null });

    expect(engine.schema().properties?.status).toEqual({
      type: ["string", "null"],
      enum: ["active", "archived", null],
    });
  });

  it("builds a safe merged response schema while keeping an observed example", () => {
    const bodies = Array.from({ length: 10 }, (_, index) => ({
      id: String(index + 1),
      name: index % 2 === 0 ? "Darko" : "Anton",
      active: index % 2 === 0,
      status: index % 2 === 0 ? "active" : "archived",
      ...(index % 2 === 1 ? { avatar: "https://example.com/anton.jpg" } : {}),
    }));
    const model = buildApiModel(
      bodies.map((body, index) => exchange(`/users/${index + 1}`, {}, body)),
      "2026-01-01T00:00:00.000Z",
    );

    const endpoint = model.endpoints[0];
    const responseBody = endpoint?.responses[0]?.bodies[0];
    expect(endpoint?.pathTemplate).toBe("/users/{id}");
    expect(responseBody?.schema.required).toEqual(["id", "name", "active", "status"]);
    expect(responseBody?.schema.properties?.id?.enum).toBeUndefined();
    expect(responseBody?.schema.properties?.name?.enum).toBeUndefined();
    expect(responseBody?.schema.properties?.active?.enum).toBeUndefined();
    expect(responseBody?.schema.properties?.status?.enum).toEqual(["active", "archived"]);
    expect(responseBody?.example).toEqual(bodies[0]);
  });
});

describe("query inference", () => {
  it("infers required and optional integer parameters", () => {
    const model = buildApiModel([
      exchange("/users", { page: "1" }),
      exchange("/users", { page: "2" }),
      exchange("/users", { page: "3", limit: "20" }),
    ]);
    expect(model.endpoints[0]?.queryParameters).toEqual([
      { name: "limit", required: false, schema: { type: "integer" }, observedCount: 1 },
      { name: "page", required: true, schema: { type: "integer" }, observedCount: 3 },
    ]);
  });
});
