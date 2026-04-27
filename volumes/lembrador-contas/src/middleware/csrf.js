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

export { generateCsrfToken as generateToken, doubleCsrfProtection };
