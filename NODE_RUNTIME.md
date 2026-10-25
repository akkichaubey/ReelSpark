# Node runtime upgrade — 2026-10-24

## Selected baseline

- Previous standalone runtime: Node v24.21.0, npm 11.19.0, built-in Undici 7.29.1.
- Installed and selected with nvm: Node v24.22.1, npm 11.19.1, built-in Undici 7.30.1.
- `.nvmrc` and `.node-version`: 24.22.1.
- `package.json` engines: `>=24.22.1 <25`.
- Docker base: `node:24.22.1-bookworm-slim` (Linux image not built locally).
- Pre-dev/build/start checks reject an older runtime rather than silently using it.

No framework or application dependency upgrade is required for this runtime
change. Existing npm security overrides remain in place.

Official security-release notes:
https://nodejs.org/en/blog/release/v24.22.1

## Windows PATH conflict — resolved 2026-10-25

The initial issue was a standalone Node 24.21.0 earlier on PATH than nvm. The
current nvm version is 24.22.1 and is the default. A fresh PowerShell now
resolves `node` and `npm` through the nvm shim:

- `node --version`: `v24.22.1`
- `npm --version`: `11.19.1`
- `node -p "process.versions.undici"`: `7.30.1`
- `nvm list`: `24.22.1 (default)`

The existing `scripts/use-project-node.ps1` remains a fallback for terminals
that inherit a stale PATH. Restart already-running Node processes after a
runtime change.

## Verification

The nvm-managed executable and bundled versions above were checked directly.
Clean installation, production build, twelve regression/export suites, real
FFmpeg exports, Remotion bundling and local production smoke checks passed.
The version guard also passed minimum-version/LTS-major boundary tests.
Detailed results and non-blocking installation warnings are in TESTING.md.
No live deployment, remote migration or cloud storage operation is part of this
runtime upgrade. Linux Docker execution remains unverified.

## Global nvm and Render verification — 2026-10-25

The project Node pins were already aligned: `.nvmrc`, `.node-version`,
`package.json` and `package-lock.json` require 24.22.1; Render's Docker service
uses `node:24.22.1-bookworm-slim`. Render's live commit `36b6cb1` matches the
verified repository commit, so no framework/dependency update or new deployment
was needed for this runtime check.

Under the globally resolved nvm runtime, `npm run prebuild`, `npm run build`,
`npm run typecheck`, and `npm run verify:server` passed. The server regression
script passed all 21 suites. Broader current QA outcomes are recorded in
TESTING.md; they include pre-existing test and lint failures unrelated to Node.

The live media-upload error is a separate schema problem: the connected D1
database does not contain the `private_media` table required by the upload
catalog. Apply `src/lib/cloudflare/migrations/0002_private_media.sql` before
relying on logout/login media recovery. No cloud migration was run during this
Node runtime check.
