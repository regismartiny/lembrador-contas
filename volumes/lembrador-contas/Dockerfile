FROM oven/bun:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcb1 \
    libxkbcommon0 \
    libxrandr2 \
    libgbm1 \
    libgobject-2.0-0 \
    libpangocairo-1.0-0 \
    libc6 \
    libx11-6 \
    libxext6 \
    libxss1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libasound2 \
    libgtk-3-0 \
    libxss1 \
    libgconf-2-4 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /root/lembrador-contas

# Install dependencies at build time
COPY package.json ./
RUN bun install

# Copy source (overridden by volume mount in development, baked-in for production)
COPY . .

CMD ["bun", "run", "start"]
