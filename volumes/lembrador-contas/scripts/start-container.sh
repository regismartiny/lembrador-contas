#!/bin/sh
set -eu

lock_hash_file="node_modules/.lock-hash"
current_lock_hash=$(sha256sum package.json bun.lock)

if [ ! -f "$lock_hash_file" ] || [ "$(cat "$lock_hash_file")" != "$current_lock_hash" ]; then
    if [ -d node_modules ] && [ ! -w node_modules ]; then
        echo "ERROR: $(pwd)/node_modules is not writable by user '$(id -un)'." >&2
        echo "Remove the stale 'lembrador_node_modules' Docker volume and restart the container." >&2
        exit 1
    fi
    bun install --frozen-lockfile --production
    printf '%s\n' "$current_lock_hash" > "$lock_hash_file"
fi

puppeteer_cache="${PUPPETEER_CACHE_DIR:-${HOME:-/home/bun}/.cache/puppeteer}"
browser_path=$(bun -e 'import puppeteer from "puppeteer"; try { console.log(await puppeteer.executablePath()); } catch {}')
if [ -z "$browser_path" ] || [ ! -x "$browser_path" ]; then
    rm -rf "$puppeteer_cache/chrome"
    bunx puppeteer browsers install chrome
fi

if [ ! -f "dist/client/index.html" ]; then
    bun run build:client
fi

exec "$@"
