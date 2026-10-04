import type { JsonSchema, PathParameter } from "@shadowapi/shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const INTEGER = /^-?\d+$/;
const HEX_HASH = /^(?:[0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{64})$/i;
const NANO_ID = /^[A-Za-z0-9_-]{16,25}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}(?::|%3A)/i;

export type SegmentKind = PathParameter["kind"];

export function classifyPathSegment(
  segment: string,
): { kind: SegmentKind; confidence: number; schema: JsonSchema } | undefined {
  const decoded = decodeURIComponent(segment);
  if (UUID.test(decoded))
    return { kind: "uuid", confidence: 1, schema: { type: "string", format: "uuid" } };
  if (ULID.test(decoded)) return { kind: "ulid", confidence: 1, schema: { type: "string" } };
  if (OBJECT_ID.test(decoded))
    return { kind: "objectId", confidence: 0.99, schema: { type: "string" } };
  if (HEX_HASH.test(decoded)) return { kind: "hash", confidence: 0.98, schema: { type: "string" } };
  if (ISO_TIMESTAMP.test(segment))
    return { kind: "timestamp", confidence: 0.98, schema: { type: "string", format: "date-time" } };
  if (INTEGER.test(decoded)) {
    const value = Number(decoded);
    const timestampLike = decoded.length >= 10 && decoded.length <= 13 && value > 946684800;
    return timestampLike
      ? { kind: "timestamp", confidence: 0.9, schema: { type: "integer" } }
      : { kind: "integer", confidence: 0.96, schema: { type: "integer" } };
  }
  if (NANO_ID.test(decoded) && /\d/.test(decoded))
    return { kind: "nanoid", confidence: 0.88, schema: { type: "string" } };
  return undefined;
}

export function normalizePath(pathname: string): {
  template: string;
  parameters: PathParameter[];
  confidence: number;
} {
  const segments = pathname.split("/");
  const parameters: PathParameter[] = [];
  const normalized = segments.map((segment, position) => {
    const match = classifyPathSegment(segment);
    if (!match) return segment;
    const name = position === segments.length - 1 ? "id" : `param${position}`;
    parameters.push({ name, position: position - 1, ...match });
    return `{${name}}`;
  });
  return {
    template: normalized.join("/") || "/",
    parameters,
    confidence:
      parameters.length === 0
        ? 1
        : Math.min(...parameters.map((parameter) => parameter.confidence)),
  };
}
