import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import Fastify, { type FastifyInstance } from "fastify";
import { request as upstreamRequest } from "undici";
import { redactExchange } from "@shadowapi/recorder";
import type {
  BinaryBody,
  Headers,
  Query,
  RecordedExchange,
  RecordingOptions,
  TrafficStore,
} from "@shadowapi/shared";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export interface ProxyOptions {
  target: string;
  store?: TrafficStore;
  recording?: RecordingOptions;
  verbose?: boolean;
  onExchange?: (exchange: RecordedExchange) => void | Promise<void>;
}

function headersFrom(input: Record<string, string | string[] | undefined>): Headers {
  return Object.fromEntries(
    Object.entries(input).filter(
      (entry): entry is [string, string | string[]] => entry[1] !== undefined,
    ),
  );
}

function requestHeaders(
  input: Record<string, string | string[] | undefined>,
  host: string,
): Record<string, string | string[]> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(
        (entry): entry is [string, string | string[]] =>
          entry[1] !== undefined && !HOP_BY_HOP.has(entry[0].toLowerCase()),
      )
      .map(([key, value]) => [
        key.toLowerCase() === "host" ? "host" : key,
        key.toLowerCase() === "host" ? host : value,
      ]),
  );
}

function parseQuery(searchParams: URLSearchParams): Query {
  const result: Query = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    result[key] = values.length === 1 ? values[0]! : values;
  }
  return result;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseBody(buffer: Buffer, contentType: string | undefined, limit: number): unknown {
  if (buffer.length === 0 || buffer.length > limit) return undefined;
  if (contentType?.toLowerCase().includes("json")) {
    try {
      return JSON.parse(buffer.toString("utf8"));
    } catch {
      return buffer.toString("utf8");
    }
  }
  if (contentType?.startsWith("text/") || contentType?.includes("x-www-form-urlencoded")) {
    return buffer.toString("utf8");
  }
  const result: BinaryBody = {
    __shadowapiBinary: true,
    encoding: "base64",
    data: buffer.toString("base64"),
  };
  return result;
}

export function createProxyServer(options: ProxyOptions): FastifyInstance {
  const app = Fastify({
    logger: options.verbose ?? false,
  });
  const bodySizeLimit = options.recording?.bodySizeLimit ?? 1024 * 1024;
  const target = new URL(options.target);

  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", (_request, payload, done) => done(null, payload));

  app.all("/*", async (request, reply) => {
    const startedAt = performance.now();
    const incomingUrl = new URL(request.raw.url ?? "/", "http://shadowapi.local");
    if (options.recording?.ignorePaths?.includes(incomingUrl.pathname)) {
      // Ignored traffic is still proxied; it simply is not persisted.
    }
    const destination = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, target);
    const requestBody = request.body instanceof Readable ? request.body : undefined;
    const requestCaptured: Buffer[] = [];
    let requestCapturedBytes = 0;
    let requestOverLimit = false;
    const requestTap = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        if (!requestOverLimit) {
          requestCapturedBytes += chunk.length;
          if (requestCapturedBytes <= bodySizeLimit) requestCaptured.push(Buffer.from(chunk));
          else {
            requestOverLimit = true;
            requestCaptured.length = 0;
          }
        }
        callback(null, chunk);
      },
    });

    try {
      const upstream = await upstreamRequest(destination, {
        method: request.method,
        headers: requestHeaders(request.headers, target.host),
        ...(request.method !== "GET" && request.method !== "HEAD" && requestBody
          ? { body: requestBody.pipe(requestTap) }
          : {}),
      });

      reply.code(upstream.statusCode);
      for (const [key, value] of Object.entries(upstream.headers)) {
        if (value !== undefined && !HOP_BY_HOP.has(key.toLowerCase())) reply.header(key, value);
      }

      const captured: Buffer[] = [];
      let capturedBytes = 0;
      let overLimit = false;
      const tap = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          if (!overLimit) {
            capturedBytes += chunk.length;
            if (capturedBytes <= bodySizeLimit) captured.push(Buffer.from(chunk));
            else {
              overLimit = true;
              captured.length = 0;
            }
          }
          callback(null, chunk);
        },
        flush(callback) {
          const requestContentType = firstHeader(request.headers["content-type"]);
          const responseContentType = firstHeader(upstream.headers["content-type"]);
          const rawExchange: RecordedExchange = {
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            request: {
              method: request.method,
              pathname: incomingUrl.pathname,
              query: parseQuery(incomingUrl.searchParams),
              headers: headersFrom(request.headers),
              ...(!requestOverLimit && requestCaptured.length > 0
                ? {
                    body: parseBody(
                      Buffer.concat(requestCaptured),
                      requestContentType,
                      bodySizeLimit,
                    ),
                  }
                : {}),
              ...(requestContentType ? { contentType: requestContentType } : {}),
            },
            response: {
              status: upstream.statusCode,
              headers: headersFrom(upstream.headers),
              ...(!overLimit && captured.length > 0
                ? { body: parseBody(Buffer.concat(captured), responseContentType, bodySizeLimit) }
                : {}),
              ...(responseContentType ? { contentType: responseContentType } : {}),
            },
            durationMs: performance.now() - startedAt,
          };
          const exchange = redactExchange(rawExchange, options.recording);
          if (!options.recording?.ignorePaths?.includes(incomingUrl.pathname)) {
            void Promise.resolve(options.store?.save(exchange))
              .then(() => options.onExchange?.(exchange))
              .catch((error: unknown) => app.log.error(error, "Failed to persist exchange"));
          }
          callback();
        },
      });
      return reply.send(upstream.body.pipe(tap));
    } catch (error) {
      request.log.error(error, "Upstream request failed");
      return reply
        .code(502)
        .send({ error: "Bad Gateway", message: "The target API could not be reached." });
    }
  });

  return app;
}
