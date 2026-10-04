# ShadowAPI

Turn observed HTTP traffic into an OpenAPI 3.1 contract, a local mock server, and actionable contract diffs.

ShadowAPI is a local-first reverse proxy. It learns routes, request and response schemas, status codes, and examples from traffic you generate—without annotations or SDK instrumentation.

## Run

Requires Node.js 22 or newer.

```bash
npx @darkooom/shadowapi --target http://localhost:3000
```

Or install it globally:

```bash
npm install --global @darkooom/shadowapi
shadowapi --target http://localhost:3000
```

Send requests through `http://localhost:9000`, then use the learned contract:

```bash
shadowapi inspect
shadowapi export
shadowapi mock
shadowapi snapshot
shadowapi diff
```

Run `shadowapi --help` or `shadowapi <command> --help` for all options.

## Security

ShadowAPI records HTTP bodies. Use only traffic you are authorized to inspect. Common credentials and secret fields are redacted before persistence, but no heuristic can identify every secret. Local captures are stored under `.shadowapi/` by default.

Read the full [documentation](https://github.com/darkooom/ShadowAPI#readme) and [security policy](https://github.com/darkooom/ShadowAPI/blob/main/SECURITY.md).

Apache-2.0 licensed.
