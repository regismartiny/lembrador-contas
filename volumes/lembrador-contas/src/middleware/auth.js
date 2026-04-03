import db from '../db.js'
import logger from '../util/logger.js'

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

export async function requireAdmin(req, res, next) {
    if (!req.session || !req.session.authenticated || !req.session.email) {
        return res.redirect('/login')
    }
    try {
        logger.info(`Checking admin access for ${req.session.email} (loginMethod: ${req.session.loginMethod})`);
        const user = await db.User.findOne({ email: req.session.email }).lean()
        logger.info(`User ${req.session.email} admin status: ${user?.admin || false}`);
        if (!user || !user.admin) {
            return res.status(403).send('Acesso negado. Apenas administradores podem realizar esta ação.')
        }
        next()
    } catch (err) {
        next(err)
    }
}
