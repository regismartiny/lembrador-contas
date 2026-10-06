FROM oven/bun:1.3.5

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libc6 \
    libcairo-gobject2 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    unzip \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /root/lembrador-contas

# Install the locked production dependencies and matching browser at build time
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_CACHE_DIR=/root/.cache/puppeteer
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
RUN bunx puppeteer browsers install chrome

# Copy source (overridden by volume mount in development, baked-in for production)
COPY . .

CMD ["sh", "./scripts/start-container.sh", "bun", "run", "start"]
