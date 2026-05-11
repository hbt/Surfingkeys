# Use official Playwright image — Chromium + all system deps included
FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app

# Install Bun (required by scripts/server.ts and scripts/test-parallel.ts)
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./

# Install node deps (Playwright browser already in base image — skip download)
# Use npm install instead of npm ci: esbuild optional platform packages are not
# pre-populated in the lock file for all platforms, which npm ci (v11) rejects.
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --ignore-scripts

# Source is mounted at runtime via volume (see docker-compose.yml)

# Build extension + stub config at container start, then run suite
# Stub: scripts/server.ts resolves CONFIG_FILE to /app/.surfingkeysrc.js — required or Playwright aborts
CMD ["bash", "-c", "CONFIG_SERVER_PORT=9602 BUILD_SUFFIX=-test node ./config/esbuild.config.js development && bun scripts/test-parallel.ts"]
