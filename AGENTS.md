<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ReelSpark — Master Module Isolation, Consistency & Documentation Rules

You are working on my existing **ReelSpark** application. Before making any changes, carefully analyze the project architecture, existing modules, shared components, dependencies, coding standards, and all relevant Markdown documentation.

## 1. Strict Module Isolation

Every ReelSpark module must work independently without unintentionally affecting other modules.

This includes:
- AI Auto Cut
- Reel Maker
- AI Moments / AI Clip Finder
- Clipping Studio
- Caption Maker
- Thumbnail Creator
- Saved Reels
- Social Publishing
- All other existing and future modules

**Critical Rule:** When implementing a feature, fixing a bug, or improving the UI in one module, do not modify or break the behavior, functionality, UI, data, or workflow of another module.

Keep all changes strictly scoped to the requested module.

## 2. Shared Components & Dependency Protection

- Identify all shared components, hooks, utilities, APIs, stores, types, and services before editing.
- Check which modules depend on the code being changed.
- Prefer module-specific changes when the requirement applies to only one module.
- Do not introduce global CSS, state, or configuration changes that affect unrelated modules.
- If a shared component must be updated, preserve backward compatibility.
- Never change shared APIs or data structures without checking every consumer.
- Avoid duplicate implementations when a reusable solution already exists.
- Do not introduce circular dependencies or unnecessary coupling.
- Never remove existing functionality to implement a new feature.

## 3. UI/UX & Design Consistency

Maintain a consistent design system across ReelSpark.

- Reuse existing design tokens, typography, spacing, colors, icons, and layouts.
- Prefer existing shadcn/ui components wherever appropriate.
- Maintain consistent buttons, inputs, dialogs, dropdowns, tooltips, notifications, and loading states.
- Support both dark and light themes.
- Maintain responsive behavior across desktop, tablet, and mobile.
- Preserve accessibility, keyboard navigation, focus management, and usability.
- Avoid unnecessary redesigns of unrelated modules.

**Important:** Visual consistency does not mean every module must have identical layouts. Preserve each module's unique workflow and functionality.

## 4. Feature & Data Isolation

- Keep module-specific business logic inside its own boundaries.
- Prevent unintended cross-module state updates.
- Ensure changes do not corrupt or overwrite existing user projects.
- Preserve existing saved projects, media files, timeline data, and export settings.
- Keep database changes backward-compatible.
- Do not modify unrelated API routes or storage workflows.
- Ensure shared FFmpeg, Remotion, AI provider, authentication, and storage integrations remain compatible with existing consumers.

## 5. Mandatory Impact Analysis Before Coding

Before implementing any change:

1. Identify the requested module and exact feature scope.
2. Read all relevant source files and Markdown instructions.
3. Identify shared dependencies and affected consumers.
4. Determine potential regression risks.
5. List the files that need modification.
6. Explain whether changes can be implemented without affecting other modules.
7. If shared changes are unavoidable, explain why and obtain approval before proceeding.

Do not start implementation until the scope and impact analysis are complete.

## 6. Mandatory QA/QC & Regression Testing

After every change:

- Run relevant unit and integration tests.
- Test the modified module's complete affected workflow.
- Run regression tests for every module that uses modified shared code.
- Validate TypeScript, ESLint, and build results.
- Check responsive behavior and dark/light mode.
- Verify loading, empty, error, and success states.
- Test relevant save, reopen, preview, and export workflows.
- Check for performance and accessibility regressions.
- Never claim a test passed unless it was actually executed successfully.
- Clearly report PASS, FAIL, BLOCKED, and NOT RUN results.

**Zero unintended regressions is the release requirement.**

## 7. Markdown Documentation — Always Keep Updated

Treat the existing project Markdown files as the source of truth for project-specific rules and architecture.

Before coding:
- Read the existing `skill.md` or equivalent project instruction file.
- Read relevant README, architecture, feature, and QA documentation.
- Follow the project's established coding and development standards.

After implementing changes:
- Update the existing relevant Markdown files.
- Document new features, behavior changes, configuration, dependencies, and limitations.
- Update architecture documentation when module boundaries change.
- Update QA/QC documentation with actual test results.
- Keep implementation status accurate: Planned, In Progress, Completed, or Blocked.
- Add or update relevant acceptance criteria.
- Remove or correct outdated information without deleting useful historical context.
- Do not create unnecessary duplicate Markdown files.
- Preserve existing documentation structure and formatting.

**Documentation updates are mandatory whenever the implementation or its documented behavior changes.**

## 8. Code Quality & Maintainability

- Follow the existing project architecture and naming conventions.
- Use TypeScript types properly.
- Avoid unnecessary `any`, duplicate logic, and unused code.
- Keep components modular and maintainable.
- Use reusable hooks and utilities where appropriate.
- Avoid hardcoded values when existing constants or design tokens are available.
- Do not introduce unnecessary dependencies.
- Preserve existing error handling and recovery behavior.
- Never silently suppress TypeScript, ESLint, or runtime errors.

## 9. Strict Change Control

- Modify only files required for the approved task.
- Do not perform unrelated refactoring.
- Do not delete or overwrite existing user data.
- Do not change environment variables, secrets, hosting, or deployment settings without approval.
- Do not merge or deploy changes without explicit approval.
- Prefer a separate Git branch and Pull Request.
- If a change risks affecting another module, stop and explain the impact before proceeding.

## 10. Required Completion Report

After every implementation, provide:

1. Module and feature updated.
2. Summary of changes.
3. Files modified.
4. Shared dependencies affected.
5. Other modules checked for regressions.
6. Tests executed and their actual results.
7. Known bugs, limitations, and pending tests.
8. Markdown files updated.
9. Git branch, commit, or Pull Request details, if applicable.

## Final Non-Negotiable Rules

**MODULE ISOLATION + BACKWARD COMPATIBILITY + UI CONSISTENCY + UPDATED MARKDOWN DOCUMENTATION + REGRESSION TESTING**

These rules apply to every ReelSpark feature, bug fix, UI improvement, refactor, and future development task.

Do not break existing functionality. Do not modify unrelated modules. Do not skip impact analysis, testing, or documentation updates.

**First audit the relevant module and its dependencies. Explain the implementation plan and wait for my approval before modifying code.**
