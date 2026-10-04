# Changelog

All notable changes to ShadowAPI are documented here.

## 0.1.0 - 2026-10-04

### Added

- Local reverse proxy with streamed upstream responses.
- Pre-persistence redaction for common credential headers and nested secret fields.
- SQLite/Drizzle storage for recorded exchanges and contract materializations.
- Deterministic normalization for integer, UUID, ULID, ObjectId, hash, timestamp, and nanoid-like path segments.
- JSON Schema inference for nested objects, arrays, optional fields, nullability, formats, query parameters, content types, and response statuses.
- Conservative, configurable enum inference based on repeated low-cardinality evidence.
- OpenAPI 3.1 export in YAML or JSON.
- Learned mock server with exact-request replay and normalized-route fallback.
- Contract snapshots and breaking/non-breaking diffs with CLI exit codes suitable for automation.
- TypeScript configuration loading and configurable proxy, mock, recording, redaction, capture-size, and enum-inference settings.
- Monorepo development command and executable CLI packaging.

### Security

- Loopback-only default bindings.
- No telemetry, hosted service, account requirement, or external AI call.
- Git exclusions and documentation for local captures, databases, snapshots, generated private specifications, and other sensitive artifacts.
