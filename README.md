<p align="center">
  <img src="assets/readme/hero.webp" alt="ShadowAPI: your API traffic, turned into a contract. A local reverse proxy that learns routes and schemas from real requests, then writes OpenAPI 3.1, serves a mock and flags breaking changes." width="100%">
</p>

<p align="center">
  <a href="https://github.com/darkooom/ShadowAPI/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/darkooom/ShadowAPI/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/@darkooom/shadowapi"><img alt="npm" src="https://img.shields.io/npm/v/%40darkooom%2Fshadowapi"></a>
  <a href="https://nodejs.org/"><img alt="Node.js 22+" src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white"></a>
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/License-Apache--2.0-blue"></a>
</p>

<p align="center">
  <a href="#quick-start"><b>Quick start</b></a>
  &nbsp;·&nbsp;
  <a href="#generate-openapi-31"><b>OpenAPI</b></a>
  &nbsp;·&nbsp;
  <a href="#run-the-learned-mock"><b>Mock</b></a>
  &nbsp;·&nbsp;
  <a href="#detect-contract-changes"><b>Diff</b></a>
  &nbsp;·&nbsp;
  <a href="docs/architecture.md"><b>Architecture</b></a>
</p>

<br>

**Turn observed HTTP traffic into an OpenAPI 3.1 contract, a local mock server, and actionable contract diffs.**

ShadowAPI is a local-first reverse proxy. Point a client at it, exercise an API, and let deterministic inference learn routes, request/response schemas, status codes, and examples—without annotations or SDK instrumentation.

<p align="center">
  <img src="assets/terminal-demo.gif" alt="Terminal demo: shadowapi proxies the example API while curl sends nine requests through port 9000; inspect lists six learned endpoints; export writes openapi.yaml; snapshot saves a baseline; the mock answers /users/1 and /users/42; after the API changes, diff reports two breaking changes and exits with 1" width="100%">
</p>

<p align="center"><sub>Real output from the <code>shadowapi</code> CLI against the bundled synthetic example API: proxy, inspect, export, snapshot, mock, and a breaking-change diff.</sub></p>

> [!WARNING]
> ShadowAPI records HTTP bodies. Use only traffic you are authorized to inspect. Common credentials and secret fields are redacted before persistence, but no heuristic can identify every secret. Review [Security and privacy](#security-and-privacy) before using sensitive systems.

## Why ShadowAPI?

- **Runtime evidence, not stale annotations.** Contracts are inferred from requests and responses that actually occurred.
- **One observation loop, three outputs.** Export OpenAPI, replay learned responses, and detect breaking changes from the same local capture.
- **Local and deterministic.** Traffic, SQLite state, inference, mocks, and diffs stay on your machine; there is no account, telemetry, cloud service, or AI call.
- **Conservative inference.** Dynamic path segments, optional fields, nullability, formats, and low-cardinality enums are learned without turning arbitrary IDs or names into constraints.
- **Composable internals.** Proxying, recording, storage, inference, OpenAPI generation, mocking, and diffing remain separate packages.

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/readme/pipeline-dark.webp">
  <img src="assets/readme/pipeline-light.webp" alt="Pipeline: 01 observe, the proxy on port 9000 forwards requests to --target and streams responses back; 02 redact, the recorder replaces credential headers and fields with [REDACTED] and limits body size; 03 store, exchanges are stored locally in .shadowapi/ in SQLite; 04 infer, deterministic inference learns path parameters, schemas, formats, optional fields and enums. One learned model feeds three outputs: OpenAPI 3.1 via shadowapi export, a mock server on port 4010 via shadowapi mock, and a contract diff via shadowapi diff that exits 1 on breaking changes." width="100%">
</picture>

Each stage is its own package; see [Architecture](docs/architecture.md) for the boundaries and data flow.

## Route learning in one glance

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/readme/routes-dark.webp">
  <img src="assets/readme/routes-light.webp" alt="Nine observed requests become six learned endpoints: GET /users/1, /users/2 and /users/3 become GET /users/{id} with an integer id and 200 and 404 responses; two GET /projects/ requests with UUIDs become GET /projects/{id} with a uuid id; POST /auth/login keeps its route, with email detected as format email and password and access_token redacted; GET /users, POST /users and GET /projects stay as they are. Known static words such as /users/me, /users/search and /users/settings stay routes of their own." width="100%">
</picture>

Integers, UUIDs, ULIDs, ObjectIds, hashes, timestamps, and nanoid-like segments become path parameters; known static routes such as `/users/me` remain separate.

## Quick start

ShadowAPI requires Node.js 22 or newer. Run it without installing:

```bash
npx @darkooom/shadowapi --target http://localhost:3000
```

Or install the CLI globally:

```bash
npm install --global @darkooom/shadowapi
shadowapi --target http://localhost:3000
```

Then point your client at `http://localhost:9000` and exercise the API you want to learn.

<p align="center">
  <img src="assets/readme/term-proxy.webp" alt="shadowapi --target http://localhost:3000 starts the proxy on 127.0.0.1:9000 and logs every exchange with method, path, status and latency, while curl in a second terminal sends requests through it" width="100%">
</p>

### Develop from source

The monorepo uses pnpm through Corepack:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

Start the bundled example API:

```bash
pnpm example
```

In another terminal, start ShadowAPI and send traffic through port `9000`:

```bash
pnpm shadowapi --target http://localhost:3000
curl http://localhost:9000/users/1
curl http://localhost:9000/users/2
```

Local observations are stored in the ignored `.shadowapi/` directory.

## Generate OpenAPI 3.1

```bash
pnpm shadowapi inspect
pnpm shadowapi export
```

<p align="center">
  <img src="assets/readme/term-inspect.webp" alt="shadowapi inspect reports 9 requests recorded and 6 endpoints learned; inspect '/users/{id}' shows 3 observations, 98% confidence and responses 200 (2) and 404 (1)" width="100%">
</p>

The inferred response schema is based on merged observations:

```yaml
type: object
properties:
  id:
    type: string
  name:
    type: string
  active:
    type: boolean
  avatar:
    type: string
    format: uri
required: [id, name, active]
```

See the deliberately synthetic [generated example](examples/generated/openapi.yaml).

## Run the learned mock

Stop the proxy, then start the mock server:

```bash
pnpm shadowapi mock
curl -i http://localhost:4010/users/1
```

<p align="center">
  <img src="assets/readme/term-mock.webp" alt="shadowapi mock serves the six learned endpoints on 127.0.0.1:4010; /users/1 replays the recorded response and /users/42, which was never observed, receives a representative response for GET /users/{id}" width="100%">
</p>

Exact recorded requests replay their observed response. Other requests matching a learned normalized route receive a representative compatible response.

## Detect contract changes

Create a baseline, exercise the changed API through the proxy, then compare:

```bash
pnpm shadowapi snapshot
# generate fresh traffic against the changed API
pnpm shadowapi diff
```

<p align="center">
  <img src="assets/readme/term-diff.webp" alt="shadowapi diff after the API changed: two breaking changes on GET /users/{id}, id changed from string to integer and active was removed, plus one non-breaking change, email was added; echo $? prints 1" width="100%">
</p>

`diff` reports response-field removals, incompatible type changes, required request changes, response status changes, enum changes, and endpoint additions. Exit codes are `0` for no breaking changes, `1` for breaking changes, and `2` for execution errors.

Only endpoints observed after the snapshot replace their baseline definitions. Unobserved baseline endpoints remain unchanged because missing traffic is not evidence that an endpoint was removed.

## Commands

| Command                                                  | Purpose                                 |
| -------------------------------------------------------- | --------------------------------------- |
| `shadowapi --target <url>`                               | Convenience form of `proxy`             |
| `shadowapi proxy --target <url> [--port 9000]`           | Observe proxied traffic                 |
| `shadowapi proxy --no-store`                             | Forward without persisting observations |
| `shadowapi inspect [path]`                               | Summarize the learned model             |
| `shadowapi export [--format yaml\|json] [--output path]` | Generate OpenAPI 3.1                    |
| `shadowapi mock [--port 4010]`                           | Replay learned responses                |
| `shadowapi snapshot`                                     | Save the current normalized contract    |
| `shadowapi diff`                                         | Compare post-snapshot observations      |
| `shadowapi reset --yes`                                  | Delete local observations and snapshots |

Global options include `--config <path>` and `--verbose`.

## Configuration

Copy [shadowapi.config.example.ts](shadowapi.config.example.ts) to `shadowapi.config.ts` and adjust it for the target API. Configuration supports proxy/mock ports, ignored paths, capture limits, redacted headers and fields, and conservative enum thresholds.

## Repository structure

```text
apps/cli/                 CLI entrypoint and package
packages/shared/          Shared contracts and interfaces
packages/proxy/           Reverse proxy transport
packages/recorder/        Capture redaction and limits
packages/storage/         SQLite/Drizzle persistence
packages/inference/       Route and JSON Schema inference
packages/openapi/         OpenAPI 3.1 rendering
packages/mock/            Learned response server
packages/diff/            Contract comparison
packages/core/            Project orchestration
examples/express-api/     Synthetic API for local E2E testing
examples/generated/       Deliberate generated artifacts
docs/                     Architecture and roadmap
```

See [Architecture](docs/architecture.md) for package boundaries and data flow.

## Security and privacy

<p align="center">
  <img src="assets/readme/openapi.webp" alt="Excerpt of the exported openapi.yaml for POST /auth/login: the request schema has email with format email and password, the response schema has access_token and expiresIn, and both examples show password and access_token as [REDACTED]" width="100%">
</p>

- Redaction happens before captured exchanges are persisted.
- Default redaction covers common credential headers and JSON field names.
- Binary captures are size-limited and represented explicitly.
- Proxy and mock servers bind to loopback by default.
- `.shadowapi/`, SQLite databases, HAR files, and local OpenAPI output are ignored by Git.

In the demo run, the example API's login token was not persisted: the exported contract shows `[REDACTED]`, and a search for the token string under `.shadowapi/` finds nothing.

Redaction is defense in depth, not a guarantee. Avoid production traffic unless you have reviewed the configuration and data-handling implications. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Project status

ShadowAPI `0.1.0` is the first public release and is available as [`@darkooom/shadowapi`](https://www.npmjs.com/package/@darkooom/shadowapi). The implemented surface and planned work are tracked separately in the [roadmap](docs/roadmap.md) and [changelog](CHANGELOG.md).

The README visuals are captured from real CLI runs against the synthetic example API; [assets/README.md](assets/README.md) documents how they were made. There is no project logo yet.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change. Never commit real traffic, `.shadowapi` state, credentials, cookies, tokens, or personal data.

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
