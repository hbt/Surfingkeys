---
adr: 1
title: esbuild as alternative bundler
status: accepted
date: 2026-01-20
category: workflow
tags:
  - build-system
  - performance
  - developer-experience
  - esbuild
  - webpack
deciders:
  - Project maintainers
technical_story: "Initial exploration of faster build alternatives to webpack"
depends_on: []
related_to: []
enhances: []
supersedes: []
superseded_by: []
enables:
  - Faster development iteration cycles
  - Potential for watch mode with sub-second rebuilds
  - Reduced CI/CD build times
---

# ADR-001: esbuild as Alternative Bundler

## Context

Surfingkeys uses webpack 5 for building the Chrome extension. The current build process:
- Takes ~6.7 seconds for development builds
- Requires two separate compilations (regular bundles + ES modules)
- Uses webpack's complex configuration system

The development workflow requires manual rebuilding after every source file change, making the build time noticeable during iterative development.

### Current Build Architecture

Webpack configuration (`config/webpack.config.js`) handles:
1. **TypeScript compilation** - Converting `.ts` files to JavaScript
2. **Module bundling** - Combining multiple source files into entry points
3. **Manifest transformation** - Converting manifest v2 to v3 for Chrome
4. **Static asset copying** - Icons, HTML, CSS, PDF.js libraries
5. **Dual output formats**:
   - Regular IIFE bundles (background.js, content.js)
   - ES modules (api.js, options.js, neovim_lib.js)

The dual compilation is necessary because:
- Chrome extensions need IIFE format for background/content scripts
- The `api.js` file is loaded dynamically via `import()` and must be an ES module
- Webpack can only output one `libraryTarget` per compilation

### Performance Bottleneck

Build time breakdown:
- First compilation: 3.3s
- Second compilation: 6.0s (cumulative)
- Total time: 6.7s

While not catastrophic, this creates friction during development, especially when making frequent small changes.

## Decision

**Add esbuild as an alternative build system alongside webpack**, rather than replacing webpack entirely.

### Implementation Details

1. **New configuration**: `config/esbuild.config.js`
   - Mirrors webpack's dual-compilation approach
   - Handles manifest transformation identically
   - Copies same static assets
   - Outputs to separate directory: `dist-esbuild/`

2. **New npm scripts**:
   ```json
   "esbuild:dev": "node ./config/esbuild.config.js development"
   "esbuild:prod": "node ./config/esbuild.config.js production"
   ```

3. **Keep webpack as default**:
   - `npm run build:dev` continues using webpack
   - Existing CI/CD and documentation unchanged
   - No disruption to current workflows

4. **Key esbuild configuration choices**:
   - Native TypeScript support (no ts-loader needed)
   - `external: ['./neovim_lib.js', './pages/options.js', './ace.js']` - Prevents bundling dynamically imported modules
   - Two separate `esbuild.build()` calls for IIFE vs ESM formats
   - Manual file copying implementation (simpler than webpack's CopyPlugin)

### Dependencies Added

- `esbuild@^0.27.2` - The bundler
- `esbuild-plugin-copy@^2.1.1` - Asset copying utility (not actively used in final implementation)

## Consequences

### Positive

- **23x faster builds** - 6.7s → 0.29s (106ms actual build time)
  - Build 1: 67ms (vs 3.3s)
  - Build 2: 33ms (vs 6.0s)
- **Improved developer experience** - Near-instant feedback during development
- **Simpler configuration** - esbuild config is more straightforward than webpack
- **No breaking changes** - Webpack remains the default, esbuild is opt-in
- **Native TypeScript** - No loader configuration needed
- **Watch mode potential** - esbuild's `--watch` enables sub-second rebuilds (not yet implemented)

### Negative

- **Maintenance burden** - Two build systems to maintain
  - Changes to entry points must be reflected in both configs
  - Manifest transformation logic is duplicated
  - Static asset copying patterns are duplicated
- **Separate output directories** - `dist/` vs `dist-esbuild/` could be confusing
- **Not battle-tested** - esbuild output hasn't been tested in production yet
  - Webpack has been proven reliable for this extension
  - Need to verify extension loads and functions identically
- **Missing webpack features** - esbuild doesn't have:
  - `/* webpackIgnore: true */` magic comments (handled via `external` config)
  - Built-in file management (had to write manual copy function)
  - Extensive plugin ecosystem

### Neutral

- **Build output size differences** - Bundling strategies differ slightly
  - webpack: Uses more aggressive tree-shaking and optimization
  - esbuild: Prioritizes speed over minimal size
  - Development builds are already unminified, so difference is negligible
- **Team adoption** - Developers can choose which build system to use
  - May need guidance on when to use each
  - CI/CD will need explicit decision on which to use long-term

## Future Work

1. **Add watch mode** - Implement `npm run esbuild:watch` for development
2. **Test in production** - Verify esbuild-built extension works identically to webpack version
3. **Benchmark production builds** - Compare minified output sizes and performance
4. **Consider migration** - If esbuild proves reliable, deprecate webpack (ADR-002)
5. **Consolidate asset copying** - Extract manifest transformation and file copying to shared utility

## Verification Steps

To confirm esbuild output works:
```bash
# Build with esbuild
npm run esbuild:dev

# Load extension in Chrome
# 1. Navigate to chrome://extensions/
# 2. Enable Developer mode
# 3. Load unpacked: dist-esbuild/development/chrome/

# Test core functionality
# - Extension loads without errors
# - Keyboard shortcuts work
# - Content scripts inject properly
# - Background service worker starts
# - Options page loads
# - Neovim integration works (if enabled)
```

## References

- Webpack config: `config/webpack.config.js`
- esbuild config: `config/esbuild.config.js`
- Build time comparison: Tested on 2026-01-20
  - Webpack: `time npm run build:dev` → 6.713s
  - esbuild: `time npm run esbuild:dev` → 0.292s
