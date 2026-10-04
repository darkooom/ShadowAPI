# Security policy

## Supported versions

ShadowAPI is pre-1.0. Security fixes are provided on the latest `0.1.x` release and the default branch.

## Reporting a vulnerability

Do not open a public issue or pull request for a suspected vulnerability. Use **Security → Report a vulnerability** in this GitHub repository so the report remains private. Include affected versions, impact, minimal reproduction steps, and any suggested mitigation. Do not attach real credentials, cookies, private traffic databases, or customer data; use synthetic evidence whenever possible.

Maintainers should acknowledge reports within five business days, keep reporters informed during investigation, and coordinate disclosure after a fix is available. If GitHub private vulnerability reporting is temporarily unavailable, use a private maintainer contact published on the repository owner profile rather than a public channel.

## Operational guidance

ShadowAPI handles potentially sensitive HTTP traffic. Use only traffic you are authorized to inspect. Run it on a trusted workstation, keep the default loopback binding, restrict permissions on `.shadowapi/`, and delete captures when they are no longer needed.

Default redaction covers common credential headers and JSON field names, but arbitrary secrets cannot be detected reliably. Configure project-specific `redactHeaders`, `redactFields`, `ignorePaths` and `bodySizeLimit` before using sensitive systems. Treat databases, snapshots, HAR files, generated specifications, and examples as potentially sensitive even after redaction; do not commit artifacts derived from private APIs or containing personal data.

ShadowAPI makes no telemetry, cloud, or AI calls. Package installation still contacts the configured npm registry.
