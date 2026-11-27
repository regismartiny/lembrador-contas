import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const swSource = fs.readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf8');

function loadServiceWorker(overrides = {}) {
    const listeners = {};
    const cacheStore = new Map();
    const deletedCaches = [];

    const mockCaches = {
        open: async (name) => {
            if (!cacheStore.has(name)) cacheStore.set(name, new Map());
            const bucket = cacheStore.get(name);
            return {
                addAll: async (urls) => {
                    for (const u of urls) bucket.set(u, { url: u, ok: true });
                },
                put: async (req, res) => {
                    bucket.set(typeof req === 'string' ? req : req.url, res);
                },
            };
        },
        keys: async () => Array.from(cacheStore.keys()),
        delete: async (name) => {
            deletedCaches.push(name);
            return cacheStore.delete(name);
        },
        match: async (req) => {
            const key = typeof req === 'string' ? req : req.url;
            for (const bucket of cacheStore.values()) {
                if (bucket.has(key)) return bucket.get(key);
            }
            return undefined;
        },
    };

    const selfObj = {
        atob: (str) => Buffer.from(str, 'base64').toString('binary'),
        location: { origin: 'https://app.example.com' },
        addEventListener: (type, fn) => { listeners[type] = fn; },
        skipWaiting: async () => {},
        clients: {
            claim: async () => {},
            matchAll: async () => [],
            openWindow: async () => {},
        },
        registration: {
            showNotification: async () => {},
            pushManager: {
                subscribe: async () => ({
                    endpoint: 'https://push.example.com/new-sub',
                    keys: { p256dh: 'p', auth: 'a' },
                }),
            },
        },
        ...overrides.self,
    };

    const sandbox = {
        self: selfObj,
        caches: mockCaches,
        clients: selfObj.clients,
        Notification: { permission: 'granted' },
        fetch: overrides.fetch || (async () => ({ ok: true, json: async () => ({}) })),
        URL,
        Uint8Array,
        Promise,
        console,
    };

    vm.runInNewContext(swSource, sandbox);
    return { listeners, cacheStore, deletedCaches, sandbox };
}

describe('Service Worker (sw.js)', () => {
    test('does not reference window.atob', () => {
        expect(swSource).not.toContain('window.atob');
        expect(swSource).toContain('self.atob');
    });

    test('pushsubscriptionchange works without window and sends x-csrf-token header', async () => {
        const fetchCalls = [];
        const { listeners } = loadServiceWorker({
            fetch: async (url, options) => {
                fetchCalls.push({ url, options });
                if (url === '/notifications/push/public_key') {
                    return {
                        ok: true,
                        json: async () => ({
                            publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
                            csrfToken: 'sw-csrf-123',
                        }),
                    };
                }
                return { ok: true };
            },
        });

        let waitPromise;
        listeners.pushsubscriptionchange({
            waitUntil: (p) => { waitPromise = p; },
        });
        await waitPromise;

        expect(fetchCalls).toHaveLength(2);
        expect(fetchCalls[0].url).toBe('/notifications/push/public_key');
        expect(fetchCalls[1].url).toBe('/notifications/push/register');
        expect(fetchCalls[1].options.method).toBe('POST');
        expect(fetchCalls[1].options.headers['x-csrf-token']).toBe('sw-csrf-123');
    });

    test('install precaches static assets and activate removes stale caches', async () => {
        const { listeners, cacheStore, deletedCaches } = loadServiceWorker();
        cacheStore.set('old-cache-v0', new Map());

        let installPromise;
        listeners.install({ waitUntil: (p) => { installPromise = p; } });
        await installPromise;
        expect(cacheStore.has('lembrador-contas-v4')).toBe(true);
        expect(cacheStore.get('lembrador-contas-v4').has('/main.js')).toBe(true);

        let activatePromise;
        listeners.activate({ waitUntil: (p) => { activatePromise = p; } });
        await activatePromise;
        expect(deletedCaches).toContain('old-cache-v0');
        expect(cacheStore.has('old-cache-v0')).toBe(false);
    });
});
