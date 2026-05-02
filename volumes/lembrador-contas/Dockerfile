FROM oven/bun:latest

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /root/lembrador-contas

# Install dependencies at build time
COPY package.json ./
RUN bun install

# Copy source (overridden by volume mount in development, baked-in for production)
COPY . .

CMD ["bun", "run", "start"]
