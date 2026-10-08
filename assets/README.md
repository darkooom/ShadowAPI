# Project assets

This directory holds the public visuals for the repository. Do not add placeholder artwork that could be mistaken for finished branding.

## Files

| Path                                | Content                                                                |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `terminal-demo.gif`                 | Terminal walkthrough: proxy, inspect, export, snapshot, mock, and diff |
| `social-preview.png`                | GitHub social preview image, 1280×640 pixels                           |
| `readme/hero.webp`                  | README header; same composition as the social preview                  |
| `readme/term-*.webp`                | Single terminal scenes used next to the matching README sections       |
| `readme/openapi.webp`               | Excerpt of the exported `openapi.yaml` for `POST /auth/login`          |
| `readme/routes-{light,dark}.webp`   | Observed requests and the endpoints learned from them                  |
| `readme/pipeline-{light,dark}.webp` | Data flow from proxy to OpenAPI, mock, and diff                        |

`logo.svg` remains reserved for a primary project logo with an accessible, simple vector source. There is no logo yet; the header and social preview use the project name in plain type.

## Provenance

All files here are original work under the repository's Apache 2.0 license.

Terminal content is real CLI output, not mock-ups. It was captured through a pseudo-terminal while `shadowapi` proxied the synthetic API in `examples/express-api`, using the `curl` requests shown in the recording. The contract-change scene ran against a modified copy of that example, with `id` as a number, `active` removed, and `email` added. The captures were rendered to images with headless Chrome. Presentation only: the home directory is shown as `~`, typing is animated, proxy and client output share one window as split panes, and a comment line in the recording narrates the API change.

Every value shown comes from the example source or from those `curl` requests, including `ada@example.com` and the placeholder token `example-secret-token`, which only appears in the client's view of the response. Hosts are `localhost`, `127.0.0.1`, and the reserved `example.com` domain.

Before adding an asset, verify that it contains no real traffic, hostnames, usernames, tokens, cookies, local filesystem paths, or customer data. Optimize media for repository size and document its source/license when it is not original work.
