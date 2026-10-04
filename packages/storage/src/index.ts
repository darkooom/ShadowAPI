import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ApiModel, RecordedExchange, TrafficStore } from "@shadowapi/shared";

const exchanges = sqliteTable("exchanges", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  method: text("method").notNull(),
  pathname: text("pathname").notNull(),
  status: integer("status").notNull(),
  durationMs: integer("duration_ms").notNull(),
  data: text("data").notNull(),
});

const contracts = sqliteTable("contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull(),
  data: text("data").notNull(),
});

export class SqliteTrafficStore implements TrafficStore {
  private readonly sqlite: Database.Database;
  private readonly db;

  constructor(public readonly filename: string) {
    mkdirSync(dirname(filename), { recursive: true });
    this.sqlite = new Database(filename);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.db = drizzle(this.sqlite);
    this.migrate();
  }

  private migrate(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS exchanges (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        method TEXT NOT NULL,
        pathname TEXT NOT NULL,
        status INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS exchanges_method_path ON exchanges(method, pathname);
      CREATE TABLE IF NOT EXISTS contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
    `);
  }

  async save(exchange: RecordedExchange): Promise<void> {
    this.db
      .insert(exchanges)
      .values({
        id: exchange.id,
        timestamp: exchange.timestamp,
        method: exchange.request.method,
        pathname: exchange.request.pathname,
        status: exchange.response.status,
        durationMs: Math.round(exchange.durationMs),
        data: JSON.stringify(exchange),
      })
      .onConflictDoUpdate({ target: exchanges.id, set: { data: JSON.stringify(exchange) } })
      .run();
  }

  async list(): Promise<RecordedExchange[]> {
    return this.db
      .select({ data: exchanges.data })
      .from(exchanges)
      .orderBy(exchanges.timestamp)
      .all()
      .map((row) => JSON.parse(row.data) as RecordedExchange);
  }

  async clear(): Promise<void> {
    this.db.delete(exchanges).run();
    this.db.delete(contracts).run();
  }

  async saveContract(model: ApiModel): Promise<void> {
    this.db
      .insert(contracts)
      .values({ createdAt: new Date().toISOString(), data: JSON.stringify(model) })
      .run();
  }

  async latestContract(): Promise<ApiModel | undefined> {
    const row = this.db
      .select({ data: contracts.data })
      .from(contracts)
      .orderBy(desc(contracts.id))
      .limit(1)
      .get();
    return row ? (JSON.parse(row.data) as ApiModel) : undefined;
  }

  count(): number {
    return (
      this.db
        .select({ value: sql<number>`count(*)` })
        .from(exchanges)
        .get()?.value ?? 0
    );
  }

  close(): void {
    this.sqlite.close();
  }
}
