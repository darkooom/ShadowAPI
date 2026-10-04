import type { InferenceOptions, JsonSchema, JsonSchemaType } from "@shadowapi/shared";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const HEX_HASH = /^(?:[0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{64}|[0-9a-f]{128})$/i;
const OPAQUE_TOKEN = /^(?=[A-Za-z0-9_-]{20,}$)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_-]+$/;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export const DEFAULT_ENUM_INFERENCE_OPTIONS = {
  minimumObservations: 10,
  maximumUniqueValues: 10,
  maximumUniqueRatio: 0.2,
} as const;

interface ResolvedEnumInferenceOptions {
  minimumObservations: number;
  maximumUniqueValues: number;
  maximumUniqueRatio: number;
}

function stringFormat(value: string): string | undefined {
  if (UUID.test(value)) return "uuid";
  if (EMAIL.test(value)) return "email";
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp) && /^\d{4}-\d{2}-\d{2}T/.test(value)) return "date-time";
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return "uri";
  } catch {
    // It is an ordinary string.
  }
  return undefined;
}

export function inferSchema(value: unknown): JsonSchema {
  if (value === null) return { type: "null" };
  if (typeof value === "string") {
    const format = stringFormat(value);
    return { type: "string", ...(format ? { format } : {}) };
  }
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (Array.isArray(value)) {
    const items = value.length === 0 ? {} : value.map(inferSchema).reduce(mergeSchemas);
    return { type: "array", items };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    return {
      type: "object",
      properties: Object.fromEntries(entries.map(([key, child]) => [key, inferSchema(child)])),
      required: entries.map(([key]) => key),
      additionalProperties: false,
    };
  }
  return {};
}

function typeList(schema: JsonSchema): JsonSchemaType[] {
  if (!schema.type) return [];
  return Array.isArray(schema.type) ? schema.type : [schema.type];
}

function mergeEnums(a: unknown[] | undefined, b: unknown[] | undefined): unknown[] | undefined {
  if (!a || !b) return undefined;
  const merged = [...new Map([...a, ...b].map((value) => [JSON.stringify(value), value])).values()];
  return merged.length <= 10 ? merged : undefined;
}

function unionSchemas(a: JsonSchema, b: JsonSchema): JsonSchema {
  const variants = [...(a.anyOf ?? [a]), ...(b.anyOf ?? [b])];
  const unique = [...new Map(variants.map((schema) => [JSON.stringify(schema), schema])).values()];
  return { anyOf: unique };
}

export function mergeSchemas(a: JsonSchema, b: JsonSchema): JsonSchema {
  if (Object.keys(a).length === 0) return b;
  if (Object.keys(b).length === 0) return a;
  if (a.anyOf || b.anyOf) return unionSchemas(a, b);
  const aTypes = typeList(a);
  const bTypes = typeList(b);
  const allTypes = [...new Set([...aTypes, ...bTypes])];

  if (allTypes.includes("integer") && allTypes.includes("number")) {
    allTypes.splice(allTypes.indexOf("integer"), 1);
  }

  const nonNull = allTypes.filter((type) => type !== "null");
  if (nonNull.length > 1) return unionSchemas(a, b);

  const type: JsonSchemaType | JsonSchemaType[] = allTypes.length === 1 ? allTypes[0]! : allTypes;
  const primary = nonNull[0];
  if (primary === "object") {
    const aProperties = a.properties ?? {};
    const bProperties = b.properties ?? {};
    const keys = new Set([...Object.keys(aProperties), ...Object.keys(bProperties)]);
    const properties = Object.fromEntries(
      [...keys].map((key) => {
        const left = aProperties[key];
        const right = bProperties[key];
        return [key, left && right ? mergeSchemas(left, right) : (left ?? right)!];
      }),
    );
    const required = (a.required ?? []).filter((key) => (b.required ?? []).includes(key));
    return { type, properties, required, additionalProperties: false };
  }
  if (primary === "array") {
    return { type, items: mergeSchemas(a.items ?? {}, b.items ?? {}) };
  }

  const format = a.format === b.format ? a.format : undefined;
  const enumValues = mergeEnums(a.enum, b.enum);
  return { type, ...(format ? { format } : {}), ...(enumValues ? { enum: enumValues } : {}) };
}

function fieldNameParts(fieldName: string): string[] {
  return fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const HIGH_CARDINALITY_FIELD_PARTS = new Set([
  "id",
  "identifier",
  "uuid",
  "guid",
  "ulid",
  "objectid",
  "name",
  "username",
  "firstname",
  "lastname",
  "fullname",
  "displayname",
  "filename",
  "email",
  "mail",
  "url",
  "uri",
  "href",
  "link",
  "avatar",
  "photo",
  "image",
  "timestamp",
  "datetime",
  "date",
  "time",
  "created",
  "updated",
  "deleted",
  "published",
  "expires",
  "expiry",
  "expiration",
  "issued",
  "at",
  "token",
  "secret",
  "password",
  "hash",
  "digest",
  "checksum",
  "nonce",
  "signature",
  "key",
]);

function isHighCardinalityField(fieldName: string | undefined): boolean {
  return (
    fieldName !== undefined &&
    fieldNameParts(fieldName).some((part) => HIGH_CARDINALITY_FIELD_PARTS.has(part))
  );
}

function isHighCardinalityValue(value: string): boolean {
  const opaqueToken =
    OPAQUE_TOKEN.test(value) && new Set(value.toLowerCase()).size / value.length >= 0.5;
  return (
    stringFormat(value) !== undefined ||
    OBJECT_ID.test(value) ||
    ULID.test(value) ||
    HEX_HASH.test(value) ||
    JWT.test(value) ||
    opaqueToken
  );
}

class SchemaAccumulator {
  private result: JsonSchema = {};
  private readonly properties = new Map<string, SchemaAccumulator>();
  private items?: SchemaAccumulator;
  private readonly stringCounts = new Map<string, number>();
  private stringObservationCount = 0;
  private observedNull = false;
  private exceededUniqueLimit = false;

  constructor(private readonly enumOptions: ResolvedEnumInferenceOptions) {}

  observe(value: unknown): void {
    this.result = mergeSchemas(this.result, inferSchema(value));

    if (value === null) {
      this.observedNull = true;
      return;
    }

    if (typeof value === "string") {
      this.stringObservationCount += 1;
      const current = this.stringCounts.get(value);
      if (current !== undefined) this.stringCounts.set(value, current + 1);
      else if (this.stringCounts.size < this.enumOptions.maximumUniqueValues)
        this.stringCounts.set(value, 1);
      else this.exceededUniqueLimit = true;
      return;
    }

    if (Array.isArray(value)) {
      this.items ??= new SchemaAccumulator(this.enumOptions);
      for (const item of value) this.items.observe(item);
      return;
    }

    if (typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        let accumulator = this.properties.get(key);
        if (!accumulator) {
          accumulator = new SchemaAccumulator(this.enumOptions);
          this.properties.set(key, accumulator);
        }
        accumulator.observe(child);
      }
    }
  }

  schema(fieldName?: string): JsonSchema {
    const schema = structuredClone(this.result);
    if (schema.anyOf) return schema;

    const types = typeList(schema);
    const primary = types.find((type) => type !== "null");
    if (primary === "object" && schema.properties) {
      for (const [key, child] of this.properties) {
        if (schema.properties[key]) schema.properties[key] = child.schema(key);
      }
      return schema;
    }
    if (primary === "array" && schema.items) {
      if (this.items) schema.items = this.items.schema(fieldName);
      return schema;
    }
    if (primary !== "string" || schema.format || !this.shouldInferEnum(fieldName)) return schema;

    schema.enum = [
      ...this.stringCounts.keys(),
      ...(this.observedNull && types.includes("null") ? [null] : []),
    ];
    return schema;
  }

  private shouldInferEnum(fieldName: string | undefined): boolean {
    const uniqueCount = this.stringCounts.size;
    return (
      !this.exceededUniqueLimit &&
      !isHighCardinalityField(fieldName) &&
      this.stringObservationCount >= this.enumOptions.minimumObservations &&
      uniqueCount >= 2 &&
      uniqueCount <= this.enumOptions.maximumUniqueValues &&
      uniqueCount / this.stringObservationCount <= this.enumOptions.maximumUniqueRatio &&
      [...this.stringCounts.entries()].every(
        ([value, count]) => count >= 2 && !isHighCardinalityValue(value),
      )
    );
  }
}

export class DeterministicSchemaInferenceEngine {
  private readonly accumulator: SchemaAccumulator;

  constructor(options: InferenceOptions = {}) {
    this.accumulator = new SchemaAccumulator({
      ...DEFAULT_ENUM_INFERENCE_OPTIONS,
      ...options.enum,
    });
  }

  observe(value: unknown): void {
    this.accumulator.observe(value);
  }

  schema(): JsonSchema {
    return this.accumulator.schema();
  }
}
