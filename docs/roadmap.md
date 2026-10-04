# Roadmap

This roadmap separates shipped behavior from planned work. Items under **Next** and **Future** are not implemented commitments.

## Implemented in 0.1.0

- Local reverse proxy and bounded, redacted traffic capture
- SQLite persistence
- Deterministic route and JSON Schema inference
- Conservative enum inference
- OpenAPI 3.1 YAML/JSON export
- Exact and normalized-route mock responses
- Contract snapshots and breaking-change diffs
- Local TypeScript/JavaScript/JSON configuration
- CLI commands for proxy, inspect, export, mock, snapshot, diff, and reset

## Next

- User-defined route hints and parameter names
- Richer multipart and non-JSON body handling
- More response-selection and scenario controls for mocks
- OpenAPI import/merge workflows
- CI-oriented machine-readable diff output and annotations
- Automated cross-platform CLI E2E coverage

## Future and cloud ideas

These are exploratory and deliberately outside the local engine today:

- Optional encrypted synchronization
- Hosted mocks
- Team contract history and review workflows
- WebSocket observation

Future hosted functionality should remain above the local `ApiModel` and `TrafficStore` boundaries. The local CLI must remain useful without an account or cloud dependency.
