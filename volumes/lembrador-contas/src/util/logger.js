import pino from 'pino';

function formatLogMessage(message, ...args) {
    if (args.length === 0) return message;

    const formattedArgs = args.map(arg => {
        if (arg instanceof Error) return arg.message;
        if (typeof arg === 'string') return arg;
        if (arg === undefined || arg === null) return String(arg);
        return JSON.stringify(arg);
    });

    return `${message} ${formattedArgs.join(' ')}`;
}

function serializeError(error) {
    if (!error || typeof error !== 'object') {
        return { message: String(error) };
    }

    let host;
    try {
        host = error.config?.url ? new URL(error.config.url).host : undefined;
    } catch {
        host = undefined;
    }

    return {
        type: error.name || error.type,
        message: error.message,
        stack: error.stack,
        code: error.code,
        statusCode: error.response?.status,
        request: error.config ? {
            method: error.config.method,
            host,
        } : undefined,
    };
}

const baseLogger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: { service: 'lembrador-contas' },
    serializers: { err: serializeError },
    redact: {
        paths: [
            'access_token',
            'refresh_token',
            'client_secret',
            'authorization',
            'headers.authorization',
            'req.headers.authorization',
            'token',
            'tokens.access_token',
            'tokens.refresh_token',
            'subscription.endpoint',
            'subscription.keys.auth',
            'subscription.keys.p256dh',
        ],
        censor: '[REDACTED]',
    }
});

const logger = new Proxy(baseLogger, {
    get(target, property, receiver) {
        if (typeof property === 'symbol') {
            return Reflect.get(target, property, receiver);
        }

        const method = target[property];
        if (typeof method === 'function' && ['info', 'warn', 'error', 'debug', 'trace', 'fatal'].includes(property)) {
            return (...args) => {
                if (args[0] && typeof args[0] === 'object' && !(args[0] instanceof Error)) {
                    return method.apply(target, args);
                }

                const message = args.length <= 1 ? args[0] : formatLogMessage(...args);
                return method.call(target, message);
            };
        }

        return Reflect.get(target, property, receiver);
    }
});

export { formatLogMessage };
export default logger;
