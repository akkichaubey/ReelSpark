# Dependency security review — 2026-10-24

## Changes and verification

Scoped npm overrides replace only vulnerable nested packages:

| Dependency chain | Before | After |
| --- | --- | --- |
| Five Remotion packages → Zod | 4.5.4 | 4.6.7 |
| Miniflare → Undici | 7.29.1 | 7.30.1 |

Next 16.4.2, React 19.3.0, Remotion 4.0.538 and Wrangler 4.152.0 were
not upgraded/downgraded. No `npm audit fix --force` was run. Postinstall Remotion
patches were reapplied. Current `npm audit`: **0 vulnerabilities**, down from
11 (9 high, 2 moderate). This is an advisory scan, not a complete security proof.

Verified locally: TypeScript, lifecycle tests, real FFmpeg single/video-merge/
normalized MP3 exports, Remotion composition bundling and Wrangler version check.
See TESTING.md for full verification and limitations.

Advisories:
- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- https://github.com/advisories/GHSA-xjj6-f33q-929c

## Runtime baseline updated; Windows PATH caveat remains

The previous standalone Node v24.21.0 bundles affected Undici 7.29.1. npm
overrides do not replace that built-in fetch implementation. After explicit
approval, nvm installed and selected Node v24.22.1; the project's verification
commands used that executable and confirmed built-in Undici 7.30.1.

Official Node v24.22.1 LTS security-release notes include Undici 7.30.1:
https://nodejs.org/en/blog/release/v24.22.1

Version files and package/lock engines now require the patched Node 24 baseline;
Docker is pinned to 24.22.1-bookworm-slim. Clean npm ci, build, regression/export
tests and a local production-server smoke check passed under Node 24.22.1.
Linux Docker execution remains unverified.

The old standalone installation still shadows nvm in an unadjusted terminal.
Use the PowerShell helper in NODE_RUNTIME.md. Pre-dev/build/start guards reject
that older runtime. No standalone uninstall or machine-wide PATH edit occurred.
