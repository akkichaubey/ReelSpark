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

## Windows PATH conflict

This machine also has a standalone Node installation in `C:\Program Files\nodejs`.
Its machine PATH entry takes priority over the nvm user shim. `nvm use 24.22.1`
alone therefore does not guarantee that an unqualified `node` command uses nvm.
No standalone installation was removed and no machine-wide PATH was rewritten.

From a PowerShell terminal in the project, run:

```powershell
. .\scripts\use-project-node.ps1
node --version
npm --version
node -p "process.versions.undici"
```

The helper selects the `.nvmrc` version and puts the installed nvm shim first for
that terminal only. Expected results: v24.22.1, 11.19.1 and 7.30.1. Run it again
in each new terminal while the standalone PATH conflict remains. Start the app
from that terminal with `npm run dev` or `npm run start` after a successful build.
Already-running Node processes do not change runtime automatically and require
a restart. Removing the standalone Node or changing machine PATH is a separate
system-level change; neither was performed here.

## Verification

The nvm-managed executable and bundled versions above were checked directly.
Clean installation, production build, twelve regression/export suites, real
FFmpeg exports, Remotion bundling and local production smoke checks passed.
The version guard also passed minimum-version/LTS-major boundary tests.
Detailed results and non-blocking installation warnings are in TESTING.md.
No live deployment, remote migration or cloud storage operation is part of this
runtime upgrade. Linux Docker execution remains unverified.
