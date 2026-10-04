import YAML from "yaml";
import { z } from "zod";
import type { ApiModel, BodyModel, EndpointPattern } from "@shadowapi/shared";

export interface OpenApiObject {
  openapi: "3.1.0";
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
  components?: Record<string, unknown>;
}

const OpenApiDocumentSchema = z.object({
  openapi: z.literal("3.1.0"),
  info: z.object({ title: z.string().min(1), version: z.string().min(1) }),
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
  components: z.record(z.string(), z.unknown()).optional(),
});

function contentFor(bodies: BodyModel[]): Record<string, unknown> | undefined {
  if (bodies.length === 0) return undefined;
  return Object.fromEntries(
    bodies.map((body) => [
      body.contentType,
      { schema: body.schema, ...(body.example !== undefined ? { example: body.example } : {}) },
    ]),
  );
}

function operationFor(endpoint: EndpointPattern): Record<string, unknown> {
  const parameters = [
    ...endpoint.parameters.map((parameter) => ({
      name: parameter.name,
      in: "path",
      required: true,
      schema: parameter.schema,
      "x-shadowapi-confidence": parameter.confidence,
    })),
    ...endpoint.queryParameters.map((parameter) => ({
      name: parameter.name,
      in: "query",
      required: parameter.required,
      schema: parameter.schema,
    })),
  ];
  const responses = Object.fromEntries(
    endpoint.responses.map((response) => {
      const content = contentFor(response.bodies);
      return [
        String(response.status),
        {
          description: `Observed ${response.count} time${response.count === 1 ? "" : "s"}`,
          ...(content ? { content } : {}),
        },
      ];
    }),
  );
  const requestContent = contentFor(endpoint.requestBodies);
  return {
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(requestContent ? { requestBody: { required: true, content: requestContent } } : {}),
    responses,
    ...(endpoint.authentication === "bearer"
      ? { security: [{ bearerAuth: [] }] }
      : endpoint.authentication === "apiKey"
        ? { security: [{ apiKeyAuth: [] }] }
        : {}),
    "x-shadowapi-samples": endpoint.sampleCount,
    "x-shadowapi-confidence": endpoint.confidence,
  };
}

export function generateOpenApi(
  model: ApiModel,
  options: { title?: string; version?: string } = {},
): OpenApiObject {
  const paths: OpenApiObject["paths"] = {};
  let hasBearer = false;
  let hasApiKey = false;
  for (const endpoint of model.endpoints) {
    paths[endpoint.pathTemplate] ??= {};
    paths[endpoint.pathTemplate]![endpoint.method.toLowerCase()] = operationFor(endpoint);
    hasBearer ||= endpoint.authentication === "bearer";
    hasApiKey ||= endpoint.authentication === "apiKey";
  }
  const securitySchemes: Record<string, unknown> = {};
  if (hasBearer) securitySchemes.bearerAuth = { type: "http", scheme: "bearer" };
  if (hasApiKey) securitySchemes.apiKeyAuth = { type: "apiKey", in: "header", name: "X-API-Key" };
  const document: OpenApiObject = {
    openapi: "3.1.0",
    info: {
      title: options.title ?? "ShadowAPI Generated API",
      version: options.version ?? "0.1.0",
    },
    paths,
    ...(Object.keys(securitySchemes).length > 0 ? { components: { securitySchemes } } : {}),
  };
  OpenApiDocumentSchema.parse(document);
  return document;
}

export function serializeOpenApi(document: OpenApiObject, format: "json" | "yaml"): string {
  return format === "json" ? `${JSON.stringify(document, null, 2)}\n` : YAML.stringify(document);
}

export function validateOpenApi(document: unknown): OpenApiObject {
  return OpenApiDocumentSchema.parse(document) as OpenApiObject;
}
