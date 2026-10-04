import type {
  ApiModel,
  BodyModel,
  EndpointPattern,
  Headers,
  HttpMethod,
  InferenceOptions,
  JsonSchema,
  Query,
  QueryParameter,
  RecordedExchange,
  ResponseModel,
} from "@shadowapi/shared";
import { normalizePath } from "./path.js";
import { DeterministicSchemaInferenceEngine, mergeSchemas } from "./schema.js";

function isJson(contentType: string | undefined): boolean {
  return contentType?.toLowerCase().includes("json") ?? false;
}

function schemaForQueryValue(value: string | string[]): JsonSchema {
  if (Array.isArray(value)) {
    return { type: "array", items: value.map(schemaForQueryValue).reduce(mergeSchemas) };
  }
  if (/^-?\d+$/.test(value)) return { type: "integer" };
  if (/^-?(?:\d+\.\d+|\d+[eE][+-]?\d+)$/.test(value)) return { type: "number" };
  if (/^(?:true|false)$/i.test(value)) return { type: "boolean" };
  return { type: "string" };
}

function mergeQueryParameters(observations: Query[], total: number): QueryParameter[] {
  const collected = new Map<string, { count: number; schema: JsonSchema }>();
  for (const query of observations) {
    for (const [name, value] of Object.entries(query)) {
      const current = collected.get(name);
      const schema = schemaForQueryValue(value);
      collected.set(name, {
        count: (current?.count ?? 0) + 1,
        schema: current ? mergeSchemas(current.schema, schema) : schema,
      });
    }
  }
  return [...collected.entries()]
    .map(([name, item]) => ({
      name,
      required: item.count === total,
      schema: item.schema,
      observedCount: item.count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mergeBodies(
  observations: Array<{ body?: unknown; contentType?: string }>,
  options: InferenceOptions,
): BodyModel[] {
  const bodies = new Map<
    string,
    { engine: DeterministicSchemaInferenceEngine; example: unknown }
  >();
  for (const observation of observations) {
    if (observation.body === undefined) continue;
    const contentType = observation.contentType?.split(";")[0]?.trim() || "application/json";
    if (!isJson(contentType)) continue;
    const existing = bodies.get(contentType);
    const engine = existing?.engine ?? new DeterministicSchemaInferenceEngine(options);
    engine.observe(observation.body);
    bodies.set(contentType, {
      engine,
      example: existing?.example ?? observation.body,
    });
  }
  return [...bodies.entries()].map(([contentType, body]) => ({
    contentType,
    schema: body.engine.schema(),
    example: body.example,
  }));
}

function mergeHeaders(values: Headers[]): Headers {
  const result: Headers = {};
  for (const headers of values) Object.assign(result, headers);
  return result;
}

function responsesFor(exchanges: RecordedExchange[], options: InferenceOptions): ResponseModel[] {
  const statuses = new Map<number, RecordedExchange[]>();
  for (const exchange of exchanges) {
    const list = statuses.get(exchange.response.status) ?? [];
    list.push(exchange);
    statuses.set(exchange.response.status, list);
  }
  return [...statuses.entries()]
    .map(([status, observations]) => ({
      status,
      count: observations.length,
      headers: mergeHeaders(observations.map((exchange) => exchange.response.headers)),
      bodies: mergeBodies(
        observations.map((exchange) => exchange.response),
        options,
      ),
    }))
    .sort((a, b) => a.status - b.status);
}

export function buildApiModel(
  exchanges: RecordedExchange[],
  generatedAt = new Date().toISOString(),
  options: InferenceOptions = {},
): ApiModel {
  const grouped = new Map<
    string,
    { normalized: ReturnType<typeof normalizePath>; exchanges: RecordedExchange[] }
  >();
  for (const exchange of exchanges) {
    const normalized = normalizePath(exchange.request.pathname);
    const key = `${exchange.request.method.toUpperCase()} ${normalized.template}`;
    const group = grouped.get(key) ?? { normalized, exchanges: [] };
    group.exchanges.push(exchange);
    grouped.set(key, group);
  }

  const endpoints: EndpointPattern[] = [...grouped.values()].map(
    ({ normalized, exchanges: items }) => {
      const hasBearer = items.some((item) => "authorization" in item.request.headers);
      const hasApiKey = items.some(
        (item) => "x-api-key" in item.request.headers || "api-key" in item.request.headers,
      );
      return {
        method: items[0]!.request.method.toUpperCase() as HttpMethod,
        pathTemplate: normalized.template,
        parameters: normalized.parameters,
        confidence: Math.min(1, normalized.confidence + Math.max(0, items.length - 1) * 0.01),
        sampleCount: items.length,
        queryParameters: mergeQueryParameters(
          items.map((item) => item.request.query),
          items.length,
        ),
        requestBodies: mergeBodies(
          items.map((item) => item.request),
          options,
        ),
        responses: responsesFor(items, options),
        ...(hasBearer
          ? { authentication: "bearer" as const }
          : hasApiKey
            ? { authentication: "apiKey" as const }
            : {}),
      };
    },
  );

  endpoints.sort(
    (a, b) => a.pathTemplate.localeCompare(b.pathTemplate) || a.method.localeCompare(b.method),
  );
  return { version: 1, generatedAt, exchangeCount: exchanges.length, endpoints };
}
