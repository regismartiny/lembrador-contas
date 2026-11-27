import db from '../db.js'
import logger from '../util/logger.js'

export function isAuthEnabled() {
    const raw = process.env.APP_PASSWORD
    return Boolean(raw && raw !== 'undefined' && raw.trim() !== '')
}

export function requireAuth(req, res, next) {
    if (!isAuthEnabled() || (req.session && req.session.authenticated)) {
        return next()
    }
    if (req.method === 'GET' && !req.path.startsWith('/.well-known')) {
        req.session.returnTo = req.originalUrl
    }
    res.redirect('/login')
}

export async function requireAdmin(req, res, next) {
    if (!isAuthEnabled()) {
        return next()
    }
    if (!req.session || !req.session.authenticated || !req.session.email) {
        return res.redirect('/login')
    }
    try {
        logger.debug({ loginMethod: req.session.loginMethod }, 'Checking admin access');
        const user = await db.User.findOne({ email: req.session.email }).lean()
        logger.debug({ isAdmin: Boolean(user?.admin) }, 'Admin access checked');
        if (!user || !user.admin) {
            return res.status(403).send('Acesso negado. Apenas administradores podem realizar esta ação.')
        }
        next()
    } catch (err) {
        next(err)
    }
}
