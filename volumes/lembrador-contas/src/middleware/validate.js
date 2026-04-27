/**
 * Lightweight runtime input validation middleware.
 * Validates request body fields against a schema and returns 400 with JSON error on failure.
 */

export function validateBody(schema) {
    return (req, res, next) => {
        const errors = [];

        for (const [field, rules] of Object.entries(schema)) {
            const value = req.body[field];

            if (rules.required && (!value || (typeof value === 'string' && !value.trim()))) {
                errors.push(rules.message || `${field} é obrigatório.`);
                continue;
            }

            if (value && rules.trim && typeof value === 'string') {
                req.body[field] = value.trim();
            }

            if (value && rules.enum && !rules.enum.includes(value)) {
                errors.push(rules.enumMessage || `${field} valor inválido.`);
            }

            if (value && rules.pattern && !rules.pattern.test(String(value))) {
                errors.push(rules.patternMessage || `${field} formato inválido.`);
            }

            if (value && rules.min !== undefined && Number(value) < rules.min) {
                errors.push(rules.rangeMessage || `${field} valor muito baixo.`);
            }

            if (value && rules.max !== undefined && Number(value) > rules.max) {
                errors.push(rules.rangeMessage || `${field} valor muito alto.`);
            }

            if (value && rules.isInt && isNaN(parseInt(value, 10))) {
                errors.push(rules.message || `${field} deve ser um número inteiro.`);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({ error: errors.join(' ') });
        }

        next();
    };
}
