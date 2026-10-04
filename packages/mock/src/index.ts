import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { normalizePath } from "@shadowapi/inference";
import { isBinaryBody, type ApiModel, type RecordedExchange } from "@shadowapi/shared";

export interface MockServerOptions {
  model: ApiModel;
  exchanges: RecordedExchange[];
  verbose?: boolean;
}

function queryMatches(url: URL, recorded: RecordedExchange): boolean {
  const actual = Object.fromEntries(
    [...new Set(url.searchParams.keys())].map((key) => {
      const values = url.searchParams.getAll(key);
      return [key, values.length === 1 ? values[0]! : values];
    }),
  );
  const normalize = (value: Record<string, string | string[]>) =>
    Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(recorded.request.query));
}

function sendBody(reply: FastifyReply, body: unknown): unknown {
  if (isBinaryBody(body)) return reply.send(Buffer.from(body.data, body.encoding));
  return reply.send(body);
}

export function createMockServer(options: MockServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.verbose ?? false });
  app.all("/*", async (request, reply) => {
    const url = new URL(request.raw.url ?? "/", "http://shadowapi.local");
    const method = request.method.toUpperCase();
    const exact = [...options.exchanges]
      .reverse()
      .find(
        (exchange) =>
          exchange.request.method.toUpperCase() === method &&
          exchange.request.pathname === url.pathname &&
          queryMatches(url, exchange),
      );
    const endpoint = options.model.endpoints.find(
      (candidate) =>
        candidate.method === method &&
        candidate.pathTemplate === normalizePath(url.pathname).template,
    );
    if (!exact && !endpoint)
      return reply.code(404).send({ error: "No recorded response", method, path: url.pathname });

    if (exact) {
      reply.code(exact.response.status);
      for (const [key, value] of Object.entries(exact.response.headers)) {
        if (
          !["content-length", "transfer-encoding", "connection", "date"].includes(key.toLowerCase())
        )
          reply.header(key, value);
      }
      return sendBody(reply, exact.response.body);
    }

    const representative =
      endpoint!.responses.find((response) => response.status >= 200 && response.status < 300) ??
      endpoint!.responses[0];
    if (!representative) return reply.code(204).send();
    const body = representative.bodies[0];
    reply.code(representative.status);
    if (body) reply.type(body.contentType);
    return sendBody(reply, body?.example);
  });
  return app;
}
