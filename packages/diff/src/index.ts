import type { ApiModel, EndpointPattern, JsonSchema } from "@shadowapi/shared";

export type ChangeSeverity = "breaking" | "non-breaking";
export interface ContractChange {
  severity: ChangeSeverity;
  endpoint: string;
  message: string;
}
export interface ContractDiff {
  changes: ContractChange[];
  breaking: ContractChange[];
  nonBreaking: ContractChange[];
}

function schemaType(schema: JsonSchema): string {
  if (schema.anyOf) return schema.anyOf.map(schemaType).sort().join(" | ");
  return Array.isArray(schema.type) ? schema.type.join(" | ") : (schema.type ?? "unknown");
}

function compareResponseSchema(
  before: JsonSchema,
  after: JsonSchema,
  endpoint: string,
  field: string,
  changes: ContractChange[],
): void {
  if (schemaType(before) !== schemaType(after)) {
    changes.push({
      severity: "breaking",
      endpoint,
      message: `response field type changed: ${field || "body"} (${schemaType(before)} → ${schemaType(after)})`,
    });
    return;
  }
  if (before.enum && after.enum) {
    const oldValues = new Set(before.enum.map((value) => JSON.stringify(value)));
    const newValues = new Set(after.enum.map((value) => JSON.stringify(value)));
    if ([...oldValues].some((value) => !newValues.has(value))) {
      changes.push({
        severity: "breaking",
        endpoint,
        message: `response enum narrowed: ${field || "body"}`,
      });
    }
    if ([...newValues].some((value) => !oldValues.has(value))) {
      changes.push({
        severity: "non-breaking",
        endpoint,
        message: `response enum extended: ${field || "body"}`,
      });
    }
  }
  if (schemaType(before).includes("object")) {
    for (const [name, oldProperty] of Object.entries(before.properties ?? {})) {
      const next = after.properties?.[name];
      const path = field ? `${field}.${name}` : name;
      if (!next)
        changes.push({
          severity: "breaking",
          endpoint,
          message: `response field removed: ${path}`,
        });
      else compareResponseSchema(oldProperty, next, endpoint, path, changes);
    }
    for (const name of Object.keys(after.properties ?? {})) {
      if (!before.properties?.[name])
        changes.push({
          severity: "non-breaking",
          endpoint,
          message: `response field added: ${field ? `${field}.` : ""}${name}`,
        });
    }
  }
  if (before.items && after.items)
    compareResponseSchema(before.items, after.items, endpoint, `${field}[]`, changes);
}

function compareRequestSchema(
  before: JsonSchema,
  after: JsonSchema,
  endpoint: string,
  field: string,
  changes: ContractChange[],
): void {
  if (schemaType(before) !== schemaType(after)) {
    changes.push({
      severity: "breaking",
      endpoint,
      message: `request field type changed: ${field || "body"} (${schemaType(before)} → ${schemaType(after)})`,
    });
    return;
  }
  if (schemaType(before).includes("object")) {
    const oldRequired = new Set(before.required ?? []);
    const newRequired = new Set(after.required ?? []);
    for (const name of newRequired) {
      if (!oldRequired.has(name))
        changes.push({
          severity: "breaking",
          endpoint,
          message: `required request field added: ${field ? `${field}.` : ""}${name}`,
        });
    }
    for (const [name, next] of Object.entries(after.properties ?? {})) {
      const previous = before.properties?.[name];
      const path = field ? `${field}.${name}` : name;
      if (previous) compareRequestSchema(previous, next, endpoint, path, changes);
      else if (!newRequired.has(name))
        changes.push({
          severity: "non-breaking",
          endpoint,
          message: `optional request field added: ${path}`,
        });
    }
  }
}

function key(endpoint: EndpointPattern): string {
  return `${endpoint.method} ${endpoint.pathTemplate}`;
}

export function diffContracts(before: ApiModel, after: ApiModel): ContractDiff {
  const changes: ContractChange[] = [];
  const oldEndpoints = new Map(before.endpoints.map((endpoint) => [key(endpoint), endpoint]));
  const newEndpoints = new Map(after.endpoints.map((endpoint) => [key(endpoint), endpoint]));
  for (const [endpointKey, oldEndpoint] of oldEndpoints) {
    const next = newEndpoints.get(endpointKey);
    if (!next) {
      changes.push({ severity: "breaking", endpoint: endpointKey, message: "endpoint removed" });
      continue;
    }
    const oldQueries = new Map(
      oldEndpoint.queryParameters.map((parameter) => [parameter.name, parameter]),
    );
    for (const parameter of next.queryParameters) {
      const previous = oldQueries.get(parameter.name);
      if (previous && !previous.required && parameter.required) {
        changes.push({
          severity: "breaking",
          endpoint: endpointKey,
          message: `query parameter became required: ${parameter.name}`,
        });
      } else if (!previous) {
        changes.push({
          severity: parameter.required ? "breaking" : "non-breaking",
          endpoint: endpointKey,
          message: `${parameter.required ? "required" : "optional"} query parameter added: ${parameter.name}`,
        });
      }
    }
    const oldStatuses = new Map(
      oldEndpoint.responses.map((response) => [response.status, response]),
    );
    const newStatuses = new Map(next.responses.map((response) => [response.status, response]));
    for (const [status, response] of oldStatuses) {
      const nextResponse = newStatuses.get(status);
      if (!nextResponse) {
        changes.push({
          severity: status >= 200 && status < 300 ? "breaking" : "non-breaking",
          endpoint: endpointKey,
          message: `response status removed: ${status}`,
        });
        continue;
      }
      const oldSchema = response.bodies[0]?.schema;
      const newSchema = nextResponse.bodies[0]?.schema;
      if (oldSchema && newSchema)
        compareResponseSchema(oldSchema, newSchema, endpointKey, "", changes);
      else if (oldSchema && !newSchema)
        changes.push({
          severity: "breaking",
          endpoint: endpointKey,
          message: `response body removed for status ${status}`,
        });
    }
    for (const status of newStatuses.keys()) {
      if (!oldStatuses.has(status))
        changes.push({
          severity: "non-breaking",
          endpoint: endpointKey,
          message: `response status added: ${status}`,
        });
    }
    const oldRequest = oldEndpoint.requestBodies[0]?.schema;
    const newRequest = next.requestBodies[0]?.schema;
    if (oldRequest && newRequest)
      compareRequestSchema(oldRequest, newRequest, endpointKey, "", changes);
    else if (!oldRequest && newRequest)
      changes.push({
        severity: "breaking",
        endpoint: endpointKey,
        message: "required request body added",
      });
  }
  for (const endpointKey of newEndpoints.keys()) {
    if (!oldEndpoints.has(endpointKey))
      changes.push({ severity: "non-breaking", endpoint: endpointKey, message: "endpoint added" });
  }
  return {
    changes,
    breaking: changes.filter((change) => change.severity === "breaking"),
    nonBreaking: changes.filter((change) => change.severity === "non-breaking"),
  };
}
