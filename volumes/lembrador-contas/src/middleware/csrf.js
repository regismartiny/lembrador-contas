import { doubleCsrf } from 'csrf-csrf';

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => process.env.SESSION_SECRET,
    getSessionIdentifier: (req) => req.sessionID || 'anonymous',
    cookieName: 'x-csrf-token',
    size: 64,
    cookieOptions: {
        sameSite: 'strict',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
    },
    getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] || req.body._csrf,
});

// Skip CSRF protection for service-worker endpoints that cannot send tokens
const csrfSkipPaths = [
    '/notifications/push/register',
    '/notifications/push/public_key',
];

const doubleCsrfProtectionWithSkip = (req, res, next) => {
    const skip = csrfSkipPaths.some(path => req.path === path);
    if (skip) return next();
    return doubleCsrfProtection(req, res, next);
};

export { generateCsrfToken as generateToken, doubleCsrfProtectionWithSkip };
