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

const baseLogger = pino({
    level: process.env.LOG_LEVEL || 'info'
});

const logger = new Proxy(baseLogger, {
    get(target, property, receiver) {
        if (typeof property === 'symbol') {
            return Reflect.get(target, property, receiver);
        }

        const method = target[property];
        if (typeof method === 'function' && ['info', 'warn', 'error', 'debug', 'trace', 'fatal'].includes(property)) {
            return (...args) => {
                const message = args.length <= 1 ? args[0] : formatLogMessage(...args);
                return method.call(target, message);
            };
        }

        return Reflect.get(target, property, receiver);
    }
});

export { formatLogMessage };
export default logger;
