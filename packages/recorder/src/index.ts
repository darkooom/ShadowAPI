import type { Headers, RecordingOptions, RecordedExchange } from "@shadowapi/shared";

export const DEFAULT_REDACTED_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
];

export const DEFAULT_REDACTED_FIELDS = [
  "password",
  "token",
  "access_token",
  "refresh_token",
  "client_secret",
  "secret",
];

const REDACTED = "[REDACTED]";

function fieldMatches(key: string, fields: Set<string>): boolean {
  const normalized = key.toLowerCase();
  return fields.has(normalized) || [...fields].some((field) => normalized.endsWith(`_${field}`));
}

export function redactHeaders(headers: Headers, additional: string[] = []): Headers {
  const names = new Set(
    [...DEFAULT_REDACTED_HEADERS, ...additional].map((name) => name.toLowerCase()),
  );
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      names.has(key.toLowerCase()) ? REDACTED : value,
    ]),
  );
}

export function redactBody(value: unknown, additional: string[] = []): unknown {
  const fields = new Set(
    [...DEFAULT_REDACTED_FIELDS, ...additional].map((name) => name.toLowerCase()),
  );
  const seen = new WeakSet<object>();

  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (typeof input !== "object" || input === null) return input;
    if (seen.has(input)) return "[CIRCULAR]";
    seen.add(input);
    return Object.fromEntries(
      Object.entries(input).map(([key, child]) => [
        key,
        fieldMatches(key, fields) ? REDACTED : walk(child),
      ]),
    );
  };

  return walk(value);
}

export function redactExchange(
  exchange: RecordedExchange,
  options: RecordingOptions = {},
): RecordedExchange {
  const requestBody =
    exchange.request.body === undefined
      ? {}
      : { body: redactBody(exchange.request.body, options.redactFields) };
  const responseBody =
    exchange.response.body === undefined
      ? {}
      : { body: redactBody(exchange.response.body, options.redactFields) };
  return {
    ...exchange,
    request: {
      ...exchange.request,
      ...requestBody,
      headers: redactHeaders(exchange.request.headers, options.redactHeaders),
    },
    response: {
      ...exchange.response,
      ...responseBody,
      headers: redactHeaders(exchange.response.headers, options.redactHeaders),
    },
  };
}
