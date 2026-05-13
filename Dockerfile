# Use official Playwright image — Chromium + all system deps included
FROM mcr.microsoft.com/playwright:v1.53.2-noble

WORKDIR /app

# Install Bun (required by scripts/server.ts and scripts/test-parallel.ts)
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | bash && \
    cp /root/.bun/bin/bun /usr/local/bin/bun && \
    chmod 755 /usr/local/bin/bun && \
    ln -s /usr/local/bin/bun /usr/local/bin/bunx
ENV PATH="/root/.bun/bin:$PATH"

# Copy dependency manifests first for layer caching
COPY package.json bun.lock ./

# Install node deps (Playwright browser already in base image — skip download)
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 bun install --ignore-scripts

# Source is mounted at runtime via volume (see docker-compose.yml)

# Run the full test suite via the npm script (builds extension, then runs tests in parallel)
CMD ["npm", "run", "test:playwright:parallel"]
