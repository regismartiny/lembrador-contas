const APP_PASSWORD = process.env.APP_PASSWORD;

export function requireAuth(req, res, next) {
    if (!APP_PASSWORD || (req.session && req.session.authenticated)) {
        return next()
    }
    if (req.method === 'GET' && !req.path.startsWith('/.well-known')) {
        req.session.returnTo = req.originalUrl
    }
    res.redirect('/login')
}
