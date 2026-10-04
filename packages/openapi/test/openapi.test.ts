import { describe, expect, it } from "vitest";
import { validate } from "@scalar/openapi-parser";
import type { ApiModel } from "@shadowapi/shared";
import { generateOpenApi, validateOpenApi } from "../src/index.js";

describe("OpenAPI generation", () => {
  it("generates a valid 3.1 document from observed endpoints", async () => {
    const model: ApiModel = {
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      exchangeCount: 2,
      endpoints: [
        {
          method: "GET",
          pathTemplate: "/users/{id}",
          parameters: [
            {
              name: "id",
              position: 1,
              kind: "integer",
              schema: { type: "integer" },
              confidence: 1,
            },
          ],
          confidence: 1,
          sampleCount: 2,
          queryParameters: [],
          requestBodies: [],
          responses: [
            {
              status: 200,
              count: 2,
              headers: {},
              bodies: [
                { contentType: "application/json", schema: { type: "object" }, example: { id: 1 } },
              ],
            },
          ],
        },
      ],
    };
    const document = generateOpenApi(model);
    expect(() => validateOpenApi(document)).not.toThrow();
    const validation = await validate(JSON.stringify(document));
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
    expect(document.paths["/users/{id}"]?.get).toBeDefined();
  });
});
