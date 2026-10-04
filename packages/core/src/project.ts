import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { diffContracts, type ContractDiff } from "@shadowapi/diff";
import { buildApiModel } from "@shadowapi/inference";
import { createMockServer } from "@shadowapi/mock";
import { generateOpenApi, serializeOpenApi, type OpenApiObject } from "@shadowapi/openapi";
import { createProxyServer } from "@shadowapi/proxy";
import type { ApiModel, RecordedExchange, ShadowConfig } from "@shadowapi/shared";
import { SqliteTrafficStore } from "@shadowapi/storage";

export interface ProjectOptions {
  cwd?: string;
  config?: ShadowConfig;
}

function snapshotFilename(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function endpointKey(endpoint: ApiModel["endpoints"][number]): string {
  return `${endpoint.method} ${endpoint.pathTemplate}`;
}

export class ShadowProject {
  readonly cwd: string;
  readonly config: ShadowConfig;
  readonly dataDirectory: string;
  readonly snapshotsDirectory: string;
  readonly store: SqliteTrafficStore;

  constructor(options: ProjectOptions = {}) {
    this.cwd = resolve(options.cwd ?? process.cwd());
    this.config = options.config ?? {};
    this.dataDirectory = resolve(this.cwd, this.config.dataDirectory ?? ".shadowapi");
    this.snapshotsDirectory = join(this.dataDirectory, "snapshots");
    this.store = new SqliteTrafficStore(join(this.dataDirectory, "shadowapi.db"));
  }

  async exchanges(): Promise<RecordedExchange[]> {
    return this.store.list();
  }

  async model(): Promise<ApiModel> {
    const model = buildApiModel(
      await this.store.list(),
      new Date().toISOString(),
      this.config.inference,
    );
    await this.store.saveContract(model);
    return model;
  }

  createProxy(
    options: {
      target?: string;
      verbose?: boolean;
      onExchange?: (exchange: RecordedExchange) => void;
    } = {},
  ): FastifyInstance {
    const target = options.target ?? this.config.target;
    if (!target)
      throw new Error(
        "A target URL is required. Pass --target or set target in shadowapi.config.ts.",
      );
    return createProxyServer({
      target,
      store: this.store,
      ...(this.config.recording ? { recording: this.config.recording } : {}),
      ...(options.verbose !== undefined ? { verbose: options.verbose } : {}),
      ...(options.onExchange ? { onExchange: options.onExchange } : {}),
    });
  }

  async openApi(): Promise<OpenApiObject> {
    return generateOpenApi(await this.model());
  }

  async exportOpenApi(format: "json" | "yaml", output: string): Promise<string> {
    const destination = resolve(this.cwd, output);
    mkdirSync(resolve(destination, ".."), { recursive: true });
    writeFileSync(destination, serializeOpenApi(await this.openApi(), format), "utf8");
    return destination;
  }

  async createMock(options: { verbose?: boolean } = {}): Promise<FastifyInstance> {
    return createMockServer({
      model: await this.model(),
      exchanges: await this.exchanges(),
      ...(options.verbose !== undefined ? { verbose: options.verbose } : {}),
    });
  }

  async snapshot(now = new Date()): Promise<{ model: ApiModel; filename: string }> {
    const model = await this.model();
    mkdirSync(this.snapshotsDirectory, { recursive: true });
    const filename = join(this.snapshotsDirectory, `${snapshotFilename(now)}.json`);
    const serialized = `${JSON.stringify(model, null, 2)}\n`;
    writeFileSync(filename, serialized, "utf8");
    writeFileSync(join(this.snapshotsDirectory, "current.json"), serialized, "utf8");
    return { model, filename };
  }

  async diff(): Promise<ContractDiff> {
    const currentSnapshot = join(this.snapshotsDirectory, "current.json");
    let previous: ApiModel;
    try {
      previous = JSON.parse(readFileSync(currentSnapshot, "utf8")) as ApiModel;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new Error("No snapshot exists. Run `shadowapi snapshot` first.");
      throw error;
    }
    const exchanges = await this.store.list();
    const snapshotTime = Date.parse(previous.generatedAt);
    const recentExchanges = exchanges.filter(
      (exchange) => Date.parse(exchange.timestamp) > snapshotTime,
    );
    if (recentExchanges.length === 0) return diffContracts(previous, previous);

    const observed = buildApiModel(
      recentExchanges,
      new Date().toISOString(),
      this.config.inference,
    );
    const observedKeys = new Set(observed.endpoints.map(endpointKey));
    const current: ApiModel = {
      ...observed,
      exchangeCount: exchanges.length,
      endpoints: [
        ...previous.endpoints.filter((endpoint) => !observedKeys.has(endpointKey(endpoint))),
        ...observed.endpoints,
      ].sort(
        (left, right) =>
          left.pathTemplate.localeCompare(right.pathTemplate) ||
          left.method.localeCompare(right.method),
      ),
    };
    await this.store.saveContract(current);
    return diffContracts(previous, current);
  }

  async reset(): Promise<void> {
    await this.store.clear();
    rmSync(this.snapshotsDirectory, { recursive: true, force: true });
  }

  close(): void {
    this.store.close();
  }
}
