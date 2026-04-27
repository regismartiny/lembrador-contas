/**
 * Wraps an async Express route handler so rejected promises
 * are forwarded to the error-handling middleware automatically.
 */
export default function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
