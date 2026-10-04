import { afterEach, describe, expect, it } from "vitest";
import type { ApiModel, RecordedExchange } from "@shadowapi/shared";
import { createMockServer } from "../src/index.js";

const model: ApiModel = {
  version: 1,
  generatedAt: "2026-01-01T00:00:00Z",
  exchangeCount: 1,
  endpoints: [
    {
      method: "GET",
      pathTemplate: "/users/{id}",
      parameters: [],
      confidence: 1,
      sampleCount: 1,
      queryParameters: [],
      requestBodies: [],
      responses: [
        {
          status: 200,
          count: 1,
          headers: {},
          bodies: [
            {
              contentType: "application/json",
              schema: { type: "object" },
              example: { id: "representative" },
            },
          ],
        },
      ],
    },
  ],
};

const exchange: RecordedExchange = {
  id: "one",
  timestamp: "2026-01-01T00:00:00Z",
  durationMs: 1,
  request: { method: "GET", pathname: "/users/123", query: { view: "full" }, headers: {} },
  response: {
    status: 200,
    headers: { "content-type": "application/json" },
    contentType: "application/json",
    body: { id: "123" },
  },
};

const servers: ReturnType<typeof createMockServer>[] = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => server.close())));

describe("mock server", () => {
  it("prefers exact requests, then falls back to the normalized endpoint", async () => {
    const server = createMockServer({ model, exchanges: [exchange] });
    servers.push(server);
    expect((await server.inject({ method: "GET", url: "/users/123?view=full" })).json()).toEqual({
      id: "123",
    });
    expect((await server.inject({ method: "GET", url: "/users/456" })).json()).toEqual({
      id: "representative",
    });
  });
});
