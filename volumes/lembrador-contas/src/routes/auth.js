import express from 'express';

const router = express.Router();

const APP_PASSWORD = process.env.APP_PASSWORD;

if (!APP_PASSWORD) {
    console.warn('WARNING: APP_PASSWORD env var is not set. Authentication is disabled — all routes are publicly accessible.');
}

router.get('/login', function (req, res) {
    if (!APP_PASSWORD || req.session.authenticated) {
        return res.redirect('/')
    }
    res.render('auth/login', { title: 'Login', error: null })
})

router.post('/login', function (req, res) {
    const password = req.body.password
    if (password === APP_PASSWORD) {
        req.session.authenticated = true
        const redirectTo = req.session.returnTo || '/'
        delete req.session.returnTo
        return res.redirect(redirectTo)
    }
    res.render('auth/login', { title: 'Login', error: 'Senha incorreta.' })
})

router.get('/logout', function (req, res) {
    req.session.destroy(() => res.redirect('/login'))
})

export default router;
