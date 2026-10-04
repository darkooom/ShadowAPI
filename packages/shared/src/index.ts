export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export type HeaderValue = string | string[];
export type Headers = Record<string, HeaderValue>;
export type Query = Record<string, string | string[]>;

export interface BinaryBody {
  __shadowapiBinary: true;
  encoding: "base64";
  data: string;
}

export interface RecordedExchange {
  id: string;
  timestamp: string;
  request: {
    method: string;
    pathname: string;
    query: Query;
    headers: Headers;
    body?: unknown;
    contentType?: string;
  };
  response: {
    status: number;
    headers: Headers;
    body?: unknown;
    contentType?: string;
  };
  durationMs: number;
}

export type JsonSchemaType =
  "string" | "integer" | "number" | "boolean" | "null" | "object" | "array";

export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  format?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean;
  anyOf?: JsonSchema[];
}

export interface PathParameter {
  name: string;
  position: number;
  kind: "integer" | "uuid" | "ulid" | "objectId" | "nanoid" | "hash" | "timestamp";
  schema: JsonSchema;
  confidence: number;
}

export interface QueryParameter {
  name: string;
  required: boolean;
  schema: JsonSchema;
  observedCount: number;
}

export interface BodyModel {
  contentType: string;
  schema: JsonSchema;
  example?: unknown;
}

export interface ResponseModel {
  status: number;
  count: number;
  headers: Headers;
  bodies: BodyModel[];
}

export interface EndpointPattern {
  method: HttpMethod;
  pathTemplate: string;
  parameters: PathParameter[];
  confidence: number;
  sampleCount: number;
  queryParameters: QueryParameter[];
  requestBodies: BodyModel[];
  responses: ResponseModel[];
  authentication?: "bearer" | "apiKey";
}

export interface ApiModel {
  version: 1;
  generatedAt: string;
  exchangeCount: number;
  endpoints: EndpointPattern[];
}

export interface TrafficStore {
  save(exchange: RecordedExchange): Promise<void>;
  list(): Promise<RecordedExchange[]>;
  clear(): Promise<void>;
  saveContract(model: ApiModel): Promise<void>;
  latestContract(): Promise<ApiModel | undefined>;
  close(): void;
}

export interface RecordingOptions {
  ignorePaths?: string[];
  redactHeaders?: string[];
  redactFields?: string[];
  bodySizeLimit?: number;
}

export interface EnumInferenceOptions {
  minimumObservations?: number;
  maximumUniqueValues?: number;
  maximumUniqueRatio?: number;
}

export interface InferenceOptions {
  enum?: EnumInferenceOptions;
}

export interface ShadowConfig {
  target?: string;
  dataDirectory?: string;
  proxy?: { port?: number; host?: string };
  mock?: { port?: number; host?: string };
  recording?: RecordingOptions;
  inference?: InferenceOptions;
}

export function isBinaryBody(value: unknown): value is BinaryBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "__shadowapiBinary" in value &&
    (value as BinaryBody).__shadowapiBinary === true
  );
}
