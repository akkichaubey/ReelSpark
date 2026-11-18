# ReelSpark verification

## Local build checks

```bash
npm run typecheck
npm run lint
npm run build
```

The Linux CI workflow builds the production image, checks the Node runtime,
audits production dependencies, and runs the Hindi-captioned render smoke
check. The standalone regression and browser suites were removed.

## Historical QA

### Planner — 2026-11-18

- **PASS** TypeScript, ESLint for the page and sidebar, and rendered fixture
  checks for all 28 slots and seven topics in both layouts, the IST label,
  platform source links, and the sidebar route.
- **FAIL** The production build stopped in the Turbopack CSS loader while
  processing `theme.css`. The retry outside the sandbox hit the same error.
- **NOT RUN** Live browser navigation, responsive rendering, light/dark themes,
  and sidebar regressions across other modules.

- [QA/QC checklist](QA_QC_CHECKLIST.md)
- [Application regression report](docs/qa-qc-2026-11-01.md)
- [Auto Cut verification](docs/AUTO_CUT_QA_2026-11-04.md)
- [Professional timeline verification](docs/professional-timeline-verification.md)
- [Storage lifecycle coverage](STORAGE_LIFECYCLE.md)
