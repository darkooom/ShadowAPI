# Contributing to ShadowAPI

Thank you for helping improve ShadowAPI. Keep changes focused, deterministic, and safe for developers who may be inspecting sensitive HTTP traffic.

## Local setup

Requirements:

- Node.js 22 or newer
- pnpm through Corepack
- A native build toolchain when a prebuilt `better-sqlite3` binary is unavailable

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

Useful development commands:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Repository structure

- `apps/cli`: command parsing, output, and process lifecycle
- `packages/core`: project-level orchestration and configuration
- `packages/proxy`: HTTP forwarding and capture integration
- `packages/recorder`: header/body redaction and capture limits
- `packages/storage`: SQLite implementation of `TrafficStore`
- `packages/inference`: deterministic route and schema inference
- `packages/openapi`: OpenAPI 3.1 rendering
- `packages/mock`: exact and normalized-route response replay
- `packages/diff`: normalized contract comparison
- `packages/shared`: cross-package data contracts
- `examples/express-api`: synthetic local test target
- `examples/generated`: reviewed, synthetic generated output only

Respect these boundaries. The CLI should not contain inference logic, inference should not depend on storage or presentation, and diffing should operate on normalized models rather than database details.

## Test expectations

- Add a regression test for every bug fix.
- Add focused unit tests for deterministic logic.
- Add transport/storage integration coverage when behavior crosses a process or persistence boundary.
- Test both the expected case and the important negative case.
- Never use captures from a real system as fixtures.
- Run the complete verification suite before opening a pull request.

### Inference changes

Inference tests must explicitly cover the evidence boundary being changed. Depending on the change, verify:

- too few samples do not produce a strong constraint;
- identifiers and high-cardinality values remain unconstrained;
- optional fields stay optional when absent from some observations;
- `null` is retained only when observed;
- type conflicts are represented conservatively;
- known static paths are not normalized as identifiers;
- integer, UUID, ULID, ObjectId, hash, timestamp, and nanoid-like paths remain deterministic;
- repeated runs over the same observations produce the same schema apart from `generatedAt`.

Avoid fixtures that accidentally look like real credentials, tokens, email addresses, or customer data.

## Local E2E workflow

Use separate terminals.

1. Start the synthetic API:

   ```bash
   pnpm example
   ```

2. Start the proxy:

   ```bash
   pnpm shadowapi --target http://localhost:3000
   ```

3. Generate traffic through the proxy:

   ```bash
   curl -i http://localhost:9000/users/1
   curl -i http://localhost:9000/users/2
   curl -i http://localhost:9000/users/999
   curl -i http://localhost:9000/users/me
   ```

4. Verify learned output:

   ```bash
   pnpm shadowapi inspect
   pnpm shadowapi export --output /tmp/shadowapi-openapi.yaml
   ```

5. Stop the proxy and verify the learned mock without the backend:

   ```bash
   pnpm shadowapi mock
   curl -i http://localhost:4010/users/1
   ```

6. Verify contract diffing:

   ```bash
   pnpm shadowapi snapshot
   # restart the proxy and exercise the changed synthetic API
   pnpm shadowapi diff
   ```

Expected diff exit codes are `0` for no breaking changes, `1` for breaking changes, and `2` for execution errors. Remove local `.shadowapi/` state when the scenario is complete.

## Pull requests

- Explain the problem, user-visible behavior, and important tradeoffs.
- Keep the diff reviewable and separate unrelated refactors.
- Include tests and the commands used to verify the change.
- Update README, configuration examples, architecture, roadmap, or changelog when behavior changes.
- Confirm `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- Do not commit generated `dist/`, coverage, Turbo caches, local databases, HAR files, raw traffic, snapshots from private APIs, credentials, cookies, tokens, or personal data.

Security vulnerabilities must be reported privately according to [SECURITY.md](SECURITY.md), not through a public issue or pull request.

By contributing, you agree that your contribution is licensed under Apache-2.0.
