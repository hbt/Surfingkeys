# JS→TS Migration: Phase 2 — Incremental Strictness

Session ref: `07d3877b-6ad6-4a04-98c2-9fb7ff44a44d`
Worktree: `/home/hassen/workspace/surfingkeys-jsts`
Branch: `jsts`
Phase 1 commit: `f9d881e`

## Rules to enable (one commit each)

- [ ] 2.1 `noImplicitAny` — explicit types on all params/returns
- [ ] 2.2 `strictNullChecks` — null/undefined safety
- [ ] 2.3 `strictFunctionTypes` — function signature variance
- [ ] 2.4 `noUnusedLocals` — dead variable cleanup
- [ ] 2.5 `noUnusedParameters` — dead param cleanup
- [ ] 2.6 ESLint TS rules (one at a time) — e.g. `@typescript-eslint/no-explicit-any`

## Commit pattern per rule

```bash
# Enable rule in tsconfig / eslint
# Fix all violations
npm run build:dev && bun scripts/verify.ts --only lint
npm run test:playwright:parallel
git commit -m "[ts] enforce noImplicitAny — phase 2.1"
```

## Notes

- Suite must pass before committing each rule
- Any regression → revert that rule
- Re-enable ESLint rules disabled in phase 1 as violations are fixed
