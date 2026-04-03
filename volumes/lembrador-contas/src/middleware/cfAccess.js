import { createRemoteJWKSet, jwtVerify } from 'jose';
import logger from '../util/logger.js';

const CF_TEAM_DOMAIN = process.env.CF_ACCESS_TEAM_DOMAIN;
const CF_AUD = process.env.CF_ACCESS_AUD;

let JWKS;
if (CF_TEAM_DOMAIN && CF_AUD) {
    JWKS = createRemoteJWKSet(new URL(`https://${CF_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    logger.info(`Cloudflare Access auth enabled (team: ${CF_TEAM_DOMAIN})`);
}

export async function cloudflareAuth(req, res, next) {
    if (!JWKS) return next();
    if (req.path === '/login') return next();
    // Don't override explicit login via login screen
    if (req.session.authenticated && req.session.loginMethod === 'explicit') return next();
    if (req.session.authenticated) return next();

    const token = req.headers['cf-access-jwt-assertion'] || req.cookies['CF_Authorization'];
    if (!token) return next();

    try {
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: `https://${CF_TEAM_DOMAIN}`,
            audience: CF_AUD,
        });
        req.session.authenticated = true;
        req.session.email = payload.email;
        req.session.loginMethod = 'cloudflare'; // Mark as Cloudflare auth
        await new Promise((resolve, reject) =>
            req.session.save(err => (err ? reject(err) : resolve()))
        );
    } catch (err) {
        logger.warn(`Cloudflare Access JWT verification failed: ${err.message}`);
    }

    next();
}
