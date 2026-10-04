import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { RecordedExchange, TrafficStore } from "@shadowapi/shared";
import { createProxyServer } from "../src/index.js";

const servers: Array<{ close(): Promise<void> }> = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => server.close())));

describe("proxy", () => {
  it("forwards requests and captures the unchanged response", async () => {
    const target = Fastify();
    target.post("/echo", async (request, reply) =>
      reply.code(201).header("x-upstream", "yes").send(request.body),
    );
    await target.listen({ port: 0, host: "127.0.0.1" });
    servers.push(target);

    let resolveExchange!: (value: RecordedExchange) => void;
    const captured = new Promise<RecordedExchange>((resolve) => (resolveExchange = resolve));
    const store: TrafficStore = {
      async save(value) {
        resolveExchange(value);
      },
      async list() {
        return [];
      },
      async clear() {},
      async saveContract() {},
      async latestContract() {
        return undefined;
      },
      close() {},
    };
    const proxy = createProxyServer({ target: target.listeningOrigin, store });
    await proxy.listen({ port: 0, host: "127.0.0.1" });
    servers.push(proxy);

    const response = await fetch(`${proxy.listeningOrigin}/echo?source=test`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer hidden" },
      body: JSON.stringify({ name: "Darko", password: "hidden" }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-upstream")).toBe("yes");
    expect(await response.json()).toEqual({ name: "Darko", password: "hidden" });
    const exchange = await captured;
    expect(exchange.request.query).toEqual({ source: "test" });
    expect(exchange.request.headers.authorization).toBe("[REDACTED]");
    expect(exchange.request.body).toEqual({ name: "Darko", password: "[REDACTED]" });
  });

  it("forwards request bodies larger than the capture limit without persisting them", async () => {
    const target = Fastify();
    target.post("/large", async (request) => ({ bytes: String(request.body).length }));
    await target.listen({ port: 0, host: "127.0.0.1" });
    servers.push(target);

    let resolveExchange!: (value: RecordedExchange) => void;
    const captured = new Promise<RecordedExchange>((resolve) => (resolveExchange = resolve));
    const store: TrafficStore = {
      async save(value) {
        resolveExchange(value);
      },
      async list() {
        return [];
      },
      async clear() {},
      async saveContract() {},
      async latestContract() {
        return undefined;
      },
      close() {},
    };
    const proxy = createProxyServer({
      target: target.listeningOrigin,
      store,
      recording: { bodySizeLimit: 8 },
    });
    await proxy.listen({ port: 0, host: "127.0.0.1" });
    servers.push(proxy);

    const body = "x".repeat(2_048);
    const response = await fetch(`${proxy.listeningOrigin}/large`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body,
    });
    expect(await response.json()).toEqual({ bytes: body.length });
    expect((await captured).request.body).toBeUndefined();
  });
});
