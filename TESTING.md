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

- [QA/QC checklist](QA_QC_CHECKLIST.md)
- [Application regression report](docs/qa-qc-2026-11-01.md)
- [Auto Cut verification](docs/AUTO_CUT_QA_2026-11-04.md)
- [Professional timeline verification](docs/professional-timeline-verification.md)
- [Storage lifecycle coverage](STORAGE_LIFECYCLE.md)
