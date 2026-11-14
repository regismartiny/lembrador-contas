import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'path';
import favicon from 'serve-favicon';
import logger from './util/logger.js';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import index from './routes/index.js';
import dashboard from './routes/dashboard.js';
import users from './routes/users.js';
import bills from './routes/bills.js';
import emails from './routes/emails.js';
import tables from './routes/tables.js';
import apis from './routes/apis.js';
import notifications from './routes/notifications.js';
import auth from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import { cloudflareAuth } from './middleware/cfAccess.js';
import { doubleCsrfProtectionWithSkip as doubleCsrfProtection, generateToken } from './middleware/csrf.js';
import { cspNonceMiddleware } from './middleware/cspNonce.js';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-me') {
      logger.fatal('SESSION_SECRET is missing or uses the default value; refusing to start');
}

const app = express();

// CSP nonce middleware — must run before helmet
app.use(cspNonceMiddleware);

// Security headers with CSP (nonce-based for inline scripts)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
            'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
            'font-src': ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
            'img-src': ["'self'", 'data:'],
            'connect-src': ["'self'"],
            'object-src': ["'none'"],
            'base-uri': ["'self'"],
            'form-action': ["'self'"],
            'frame-ancestors': ["'none'"],
        },
    },
}));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// rate limiter
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 1000, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})
// Apply the rate limiting middleware to all requests
app.use(function requestLogger(req, res, next) {
  const startTime = process.hrtime.bigint();
  res.on('finish', () => {
    const responseTimeMs = Number(process.hrtime.bigint() - startTime) / 1e6;
    logger.info({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTimeMs: Number(responseTimeMs.toFixed(2)),
    }, 'HTTP request completed');
  });
  next();
});

// Apply rate limiting after request logging so rejected requests are recorded.
app.use(limiter)

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Static assets served before auth so CSS/JS/SW are always reachable
app.use(express.static(path.join(__dirname, 'public')));
app.use('/jquery', express.static(__dirname + './../node_modules/jquery/dist/'));
app.use('/jquery-mask', express.static(__dirname + './../node_modules/jquery-mask-plugin/dist/'));
app.use('/popperjs', express.static(__dirname + './../node_modules/popper.js/dist/umd/'));
app.use('/bootstrap', express.static(__dirname + './../node_modules/bootstrap/dist/'));

// Session — must come after static assets but before any authenticated routes
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}))

// Health check — public, used by Docker and load balancers
app.get('/health', function (req, res) {
    res.status(200).json({ status: 'ok' });
});

// Cloudflare Access — verify JWT and auto-authenticate if present
app.use(cloudflareAuth);

// CSRF protection
app.use(doubleCsrfProtection);

// Expose session email and CSRF token to all EJS views
app.use(function (req, res, next) {
    res.locals.currentUserEmail = req.session.email || '';
    res.locals.csrfToken = generateToken(req, res);
    next();
});

// Auth routes (login/logout) are public
app.use('/', auth);

// All routes below require a valid session
app.use(requireAuth);

app.use('/', index);
app.use('/dashboard', dashboard);
app.use('/users', users);
app.use('/bills', bills);
app.use('/emails', emails);
app.use('/tables', tables);
app.use('/apis', apis);
app.use('/notifications', notifications);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function (err, req, res, next) {
  // If headers are already sent (e.g. serve-static emitted an error after streaming
  // a response), delegate to Express's built-in error handler so it can close the
  // connection cleanly instead of crashing with "Cannot set headers after they are sent".
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.status || 500;
  const log = statusCode >= 500 ? logger.error : logger.warn;
  log.call(logger, {
    err: { type: err.name, message: err.message, stack: err.stack },
    method: req.method,
    path: req.path,
    statusCode,
  }, 'HTTP request failed');

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(statusCode);
  res.render('error');
});

export default app;