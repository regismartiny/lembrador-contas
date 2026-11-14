import { randomBytes } from 'node:crypto';

/**
 * Generates a per-request CSP nonce and exposes it via res.locals.
 * Must be registered before helmet and before any route that renders views.
 */
export function cspNonceMiddleware(req, res, next) {
    const nonce = randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;
    next();
}
