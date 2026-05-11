# Use official Playwright image — Chromium + all system deps included
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# Install Bun (required by scripts/server.ts and scripts/test-parallel.ts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./

# Install node deps (Playwright browser already in base image — skip download)
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --ignore-scripts

# Copy full source
COPY . .

# Build the extension (test suffix only — that's what Playwright uses)
RUN CONFIG_SERVER_PORT=9602 BUILD_SUFFIX=-test node ./config/esbuild.config.js development

# Stub config for port-9601 server (config-server-debug tests only)
# scripts/server.ts resolves CONFIG_FILE to /app/.surfingkeysrc.js (import.meta.dir/../)
# Without this file, Playwright aborts before running any tests
RUN echo 'settings.showModeIndicator = true;' > /app/.surfingkeysrc.js

# Default: run full suite, 9 workers, no coverage
CMD ["bunx", "playwright", "test", "--workers=9"]
