#!/bin/sh
set -eu

browser_path=$(bun -e 'import puppeteer from "puppeteer"; try { console.log(await puppeteer.executablePath()); } catch {}')
if [ -z "$browser_path" ] || [ ! -x "$browser_path" ]; then
    bunx puppeteer browsers install chrome
fi

exec "$@"