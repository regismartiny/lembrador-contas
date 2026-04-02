FROM oven/bun:latest

WORKDIR /root/lembrador-contas

# Install dependencies at build time
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source (overridden by volume mount in development, baked-in for production)
COPY . .

CMD ["bun", "run", "start"]
