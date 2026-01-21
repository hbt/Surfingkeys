---
adr: 6
title: Configuration file consolidation and build system simplification
status: accepted
date: 2026-01-21
category: tooling
tags:
  - build-system
  - configuration
  - developer-experience
  - cleanup
deciders:
  - Project maintainers
technical_story: "Consolidate scattered configuration files and remove unused build dependencies"
depends_on:
  - adr-001
related_to:
  - adr-001
enhances:
  - adr-001
supersedes: []
superseded_by: []
enables:
  - Simplified project structure
  - Faster builds with esbuild as primary bundler
  - Centralized configuration management
  - Reduced maintenance burden
---

# ADR-006: Configuration File Consolidation and Build System Simplification

## Context

The repository had accumulated multiple configuration files and redundant build systems over time:

### Configuration Sprawl
- 13+ configuration files scattered across root directory
- Mix of active, legacy, and unused configs
- No clear organizational structure
- Difficult to determine which configs were actually in use

### Dual Build Systems
Per ADR-001, webpack and esbuild coexisted as parallel build systems:
- **webpack**: Legacy default (6.7s builds)
- **esbuild**: Alternative option (0.29s builds, 23x faster)

Both systems required maintenance:
- Duplicated manifest transformation logic
- Duplicated entry point definitions
- Duplicated static asset copying patterns
- Separate output directories (`dist/` vs `dist-esbuild/`)

### Unused Dependencies
The project included unused build tooling:
- **Babel**: All dependencies present but completely unused
  - TypeScript handled by ts-loader (webpack) and natively (esbuild)
  - ts-jest handled test transpilation
  - No babel-loader configuration in webpack
- **Webpack loaders**: ts-loader, file-loader, string-replace-loader, style-loader
- **Legacy files**: `firefox_pac.js` with no code references

### Root Directory Clutter
Configuration files scattered in root:
- `eslint.config.js`
- `jest.config.js`
- `jest.config.cdp.js`
- `babel.config.json` (unused)
- `tsconfig.json`

The `config/` directory existed but was underutilized, containing only build configs.

## Decision

**Implement comprehensive configuration consolidation and build system simplification:**

### 1. Remove Unused Configurations

**Removed files:**
- `babel.config.json` - Completely unused, no babel-loader
- `firefox_pac.js` - Legacy Firefox proxy config with no references

**Removed dependencies:**
```json
"@babel/plugin-proposal-class-properties"
"@babel/plugin-proposal-optional-chaining"
"@babel/plugin-transform-runtime"
"@babel/preset-env"
"@babel/preset-typescript"
"@babel/runtime"
"babel-plugin-module-resolver"
```

### 2. Migrate to esbuild as Primary Bundler

**Remove webpack entirely:**
- Delete `config/webpack.config.js`
- Delete `config/webpack.test.config.js`
- Delete `config/jest/testServer.js` (referenced webpack test build)
- Remove all webpack dependencies and loaders

**Update build scripts:**
```json
{
  "build:dev": "node ./config/esbuild.config.js development",
  "build:prod": "node ./config/esbuild.config.js production",
  "watch": "node ./config/esbuild.config.js development --watch"
}
```

**Unify output directory:**
- Change from `dist-esbuild/` to `dist/`
- Update all references in test and debug scripts
- Update `.gitignore` to remove `dist-esbuild` entry

**Add missing dependency:**
- `events@^3.3.0` - Browser polyfill for EventEmitter (used in Nvim transport)

### 3. Consolidate Configurations in config/

**Move to config/ directory:**
- `eslint.config.js` → `config/eslint.config.js`
- `jest.config.js` → `config/jest.config.js`
- `jest.config.cdp.js` → `config/jest.config.cdp.js`

**Update package.json scripts:**
```json
{
  "test": "jest --config=config/jest.config.js",
  "lint": "eslint --config config/eslint.config.js src tests debug scripts --ext .js,.ts"
}
```

**Fix path resolution:**
```javascript
// In config/jest.config.js and config/jest.config.cdp.js
module.exports = {
  rootDir: '..',  // Point back to project root
  // ... other config
};
```

**Update test runners:**
- `tests/cdp/run-headless.js` - Use `config/jest.config.cdp.js`
- `tests/cdp/run-live.js` - Use `config/jest.config.cdp.js`
- `debug/run-headless.js` - Update `dist-esbuild` → `dist`
- `debug/run-live.js` - Update `dist-esbuild` → `dist`

## Implementation

### Commit 1: Remove Unused Configs
```bash
git rm babel.config.json firefox_pac.js
```

### Commit 2: Migrate to esbuild
```bash
# Update package.json - remove webpack deps, update scripts
# Remove webpack config files
git rm config/webpack.config.js config/webpack.test.config.js config/jest/testServer.js
# Update esbuild.config.js output path
# Update .gitignore
npm install  # Sync dependencies
npm run build:dev  # Verify build works
```

### Commit 3: Consolidate Configs
```bash
# Move config files
git mv eslint.config.js config/
git mv jest.config.js config/
git mv jest.config.cdp.js config/
# Update package.json scripts
# Update test/debug runners
# Add rootDir to jest configs
npm run lint  # Verify
npm run test:cdp:headless tests/cdp/cdp-error-viewer.test.ts  # Verify
```

## Consequences

### Positive

**Simplified Build System:**
- Single build tool (esbuild) instead of dual maintenance
- 33x faster builds (6.7s → 0.2s)
- No duplicated configuration logic
- Unified output directory

**Cleaner Project Structure:**
- All configs centralized in `config/` directory
- Root directory decluttered (13 → 8 config-like files)
- Clear organizational pattern
- `tsconfig.json` remains in root (TypeScript convention)

**Reduced Dependencies:**
- Removed 14 unused npm packages
- Smaller `node_modules/`
- Faster `npm install`
- Less maintenance burden

**Better Developer Experience:**
- Obvious location for all configs (`config/` directory)
- Faster iteration cycles with sub-second builds
- Watch mode enables live development workflow
- Clearer project organization for new contributors

**Maintainability:**
- Single build system to maintain
- No config duplication
- Easier to update build configuration
- Reduced cognitive load

### Negative

**Migration Disruption:**
- Breaking change for any external tooling referencing old paths
- Developers need to update muscle memory for config locations
- Documentation needs updates

**Lost webpack Features:**
- No longer have webpack's extensive plugin ecosystem
- Lost `/* webpackIgnore: true */` magic comments (now using esbuild `external` config)
- Some advanced webpack optimizations unavailable

**Test Dependencies on Build:**
- Tests now depend on `dist/` existing (built with esbuild)
- Must run `npm run build:dev` before tests
- Previously could test source files directly

### Neutral

**TypeScript Configuration:**
- `tsconfig.json` remains in root directory
- TypeScript convention is root-level config
- Consistent with most TypeScript projects

**Environment Files:**
- `.env.*` files remain in root
- Convention for dotenv is root-level
- Not moved to config/

## Verification

### Build System
```bash
# Clean build from scratch
npm run clean
npm run build:dev
# Verify output in dist/development/chrome/

# Production build
npm run build:prod
# Verify minification and output
```

### Linting
```bash
npm run lint
# Should find config at config/eslint.config.js
# Should pass with only warnings (no errors)
```

### Testing
```bash
# CDP tests
npm run test:cdp:headless tests/cdp/cdp-error-viewer.test.ts
# Should use config/jest.config.cdp.js

# Regular tests
npm run test
# Should use config/jest.config.js
```

### Watch Mode
```bash
npm run watch
# Should rebuild on file changes
# Verify builds complete in <1s
```

## Current State (After Implementation)

### Config Directory Structure
```
config/
├── esbuild.config.js       # Primary build configuration
├── eslint.config.js        # Linting rules
├── jest.config.js          # Main test configuration
├── jest.config.cdp.js      # CDP test configuration
└── jest/
    ├── afterEnv.js
    ├── globalSetup.js
    └── globalTeardown.js
```

### Root Directory Configs (Kept)
```
.env.example               # CDP test templates
.env.headless
.env.live
.gitignore                 # Git configuration
.gitattributes
tsconfig.json              # TypeScript (convention: root-level)
package.json               # NPM configuration
```

### Build Scripts
```json
{
  "clean": "rm -rf dist/*",
  "build:dev": "node ./config/esbuild.config.js development",
  "build:prod": "node ./config/esbuild.config.js production",
  "watch": "node ./config/esbuild.config.js development --watch",
  "lint": "eslint --config config/eslint.config.js src tests debug scripts --ext .js,.ts",
  "test": "jest --config=config/jest.config.js"
}
```

## Metrics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Build time (dev) | 6.7s | 0.2s | 33x faster |
| Root config files | 13 | 8 | -5 files |
| Build systems | 2 | 1 | Simplified |
| Webpack deps | 14 | 0 | -14 packages |
| Babel deps | 7 | 0 | -7 packages |
| Config dirs | 2 | 1 | Unified |

## Future Work

1. **Update Documentation**
   - Update README with new build commands
   - Update CONTRIBUTING.md with config locations
   - Update any onboarding docs

2. **CI/CD Updates**
   - Verify CI uses correct build commands
   - Update any deployment scripts
   - Check GitHub Actions workflow

3. **Consider Further Consolidation**
   - Could move `tsconfig.json` to `config/` (non-standard but cleaner)
   - Could create `config/env/` for .env files
   - Consider `config/git/` for .gitignore/.gitattributes

4. **Performance Monitoring**
   - Track build times over time
   - Ensure esbuild remains performant as codebase grows
   - Consider implementing build caching

5. **Watch Mode Enhancement**
   - Add automatic browser reload on rebuild
   - Integrate with CDP testing for live test runs
   - Consider hot module replacement

## References

- Previous: ADR-001 (esbuild as alternative bundler)
- Webpack config: `config/webpack.config.js` (deleted)
- esbuild config: `config/esbuild.config.js`
- Implementation commits: cleanup-configs branch
- Build time testing: 2026-01-21
  - webpack (before): 6.7s
  - esbuild (after): 0.2s
- Package.json changes: 21 dependencies removed
