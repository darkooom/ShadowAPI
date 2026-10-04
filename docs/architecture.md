# Architecture

ShadowAPI uses a one-way, local data flow:

```text
HTTP client
    │
    ▼
proxy ──► recorder/redaction ──► TrafficStore (SQLite)
                                      │
                                      ▼
                              deterministic inference
                                      │
                                      ▼
                                   ApiModel
                              ┌───────┼────────┐
                              ▼       ▼        ▼
                           OpenAPI   mock   snapshot/diff
```

The normalized `ApiModel` is the boundary between observation and all generated outputs. Package dependencies flow toward shared contracts; rendering and process lifecycle do not leak back into inference.

## Runtime components

### Proxy

`@shadowapi/proxy` accepts local HTTP requests, forwards them to the configured upstream with `undici`, and streams the upstream response back to the client. It delegates capture sanitization before saving a `RecordedExchange`.

### Recorder

`@shadowapi/recorder` applies capture-size limits and recursively redacts configured headers and body fields. Redaction occurs before persistence. The recorder cannot guarantee detection of arbitrary secrets, so callers must use only authorized traffic and configure project-specific rules.

### Storage

`@shadowapi/storage` implements `TrafficStore` with SQLite and Drizzle ORM. Exchanges are the source observations; normalized contract materializations are stored separately. SQLite uses WAL mode and an index over method/path lookup fields.

### Inference

`@shadowapi/inference` is deterministic and storage-independent. It:

- classifies dynamic path segments such as integers, UUIDs, ULIDs, ObjectIds, hashes, timestamps, and nanoid-like values;
- keeps known static segments separate;
- groups observations by method and normalized path;
- merges JSON object, array, scalar, optional, nullable, query, content-type, and status evidence;
- applies conservative enum thresholds while excluding identifier-like fields and values.

The same observations produce the same schema apart from the model generation timestamp.

### OpenAPI

`@shadowapi/openapi` converts `ApiModel` into OpenAPI 3.1 JSON or YAML. It does not perform inference; it renders normalized evidence and representative examples.

### Mock

`@shadowapi/mock` first looks for an exact recorded method/path/query request. If no exact exchange exists, it normalizes the requested path and returns a representative response from the learned endpoint. It runs independently of the real backend.

### Diff

`@shadowapi/diff` compares two `ApiModel` values without storage knowledge. It classifies response removals and incompatible type/request changes as breaking, while additions such as optional response fields and new endpoints are non-breaking.

At the project layer, post-snapshot observations replace only the endpoints they re-exercise. Unobserved baseline endpoints are retained because absent traffic is not proof of endpoint removal.

### Core orchestration

`@shadowapi/core` owns configuration loading, project paths, storage lifecycle, model generation, snapshot files, mock creation, OpenAPI export, and the post-snapshot comparison window. It composes packages rather than reimplementing their logic.

### CLI

`shadowapi` in `apps/cli` owns command parsing, human-readable output, exit codes, and server shutdown. It delegates all domain behavior to `@shadowapi/core`.

## Package boundaries

| Package                | Owns                            | Must not own               |
| ---------------------- | ------------------------------- | -------------------------- |
| `@shadowapi/shared`    | Data contracts and interfaces   | Runtime orchestration      |
| `@shadowapi/proxy`     | HTTP transport                  | Schema inference           |
| `@shadowapi/recorder`  | Sanitization and capture limits | Persistence                |
| `@shadowapi/storage`   | `TrafficStore` persistence      | HTTP or OpenAPI behavior   |
| `@shadowapi/inference` | Deterministic normalization     | Filesystem or CLI behavior |
| `@shadowapi/openapi`   | OpenAPI rendering               | Observation collection     |
| `@shadowapi/mock`      | Learned response serving        | Traffic recording          |
| `@shadowapi/diff`      | Contract comparison             | Snapshot storage           |
| `@shadowapi/core`      | Composition and lifecycle       | CLI presentation           |
| `shadowapi`            | Commands and process UX         | Domain inference           |

## Data and privacy boundary

Raw upstream bytes pass through the proxy, but only the bounded, redacted `RecordedExchange` is sent to storage. Local state lives under `.shadowapi/` by default and is excluded from Git. Snapshots contain normalized `ApiModel` data and may still reveal private API shapes or examples; they must be reviewed before sharing.

Cloud authentication, tenancy, synchronization, and hosted storage are not part of this architecture. Any future hosted layer should build above `ApiModel` and `TrafficStore` rather than entering deterministic inference packages.
