import { describe, expect, it } from "vitest";
import type { ApiModel, EndpointPattern } from "@shadowapi/shared";
import { diffContracts } from "../src/index.js";

function model(endpoint: EndpointPattern): ApiModel {
  return {
    version: 1,
    generatedAt: "2026-01-01T00:00:00Z",
    exchangeCount: 1,
    endpoints: [endpoint],
  };
}
const base: EndpointPattern = {
  method: "GET",
  pathTemplate: "/users/{id}",
  parameters: [],
  confidence: 1,
  sampleCount: 1,
  queryParameters: [
    { name: "verbose", required: false, observedCount: 1, schema: { type: "boolean" } },
  ],
  requestBodies: [],
  responses: [
    {
      status: 200,
      count: 1,
      headers: {},
      bodies: [
        {
          contentType: "application/json",
          schema: {
            type: "object",
            properties: { username: { type: "string" }, age: { type: "number" } },
            required: ["username", "age"],
          },
        },
      ],
    },
  ],
};

describe("contract diff", () => {
  it("classifies breaking response and query changes", () => {
    const next = structuredClone(base);
    next.queryParameters[0]!.required = true;
    next.responses[0]!.bodies[0]!.schema = {
      type: "object",
      properties: { age: { type: "string" } },
      required: ["age"],
    };
    const result = diffContracts(model(base), model(next));
    expect(result.breaking.map((change) => change.message)).toEqual(
      expect.arrayContaining([
        "query parameter became required: verbose",
        "response field removed: username",
        "response field type changed: age (number → string)",
      ]),
    );
  });

  it("treats endpoint additions as non-breaking", () => {
    const after = model(base);
    after.endpoints.push({ ...base, method: "POST", pathTemplate: "/users" });
    expect(diffContracts(model(base), after).breaking).toHaveLength(0);
  });
});
