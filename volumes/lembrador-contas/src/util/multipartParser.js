const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
const CRLF2 = Buffer.from('\r\n\r\n');

export class MultipartUploadError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'MultipartUploadError';
        this.status = status;
    }
}

function readStreamWithLimit(req, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        let settled = false;

        const fail = (err) => {
            if (settled) return;
            settled = true;
            reject(err);
        };

        req.on('data', (chunk) => {
            if (settled) return;
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buf.length;
            if (total > maxBytes) {
                req.pause?.();
                fail(new MultipartUploadError(
                    `O arquivo enviado excede o limite máximo de ${Math.round(maxBytes / (1024 * 1024))} MB.`,
                    413
                ));
                return;
            }
            chunks.push(buf);
        });

        req.on('end', () => {
            if (settled) return;
            settled = true;
            resolve(Buffer.concat(chunks, total));
        });

        req.on('error', (err) => {
            fail(new MultipartUploadError(`Erro ao ler upload: ${err.message}`, 400));
        });
    });
}

function extractBoundary(contentType) {
    if (typeof contentType !== 'string') return null;
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    return match ? (match[1] || match[2]) : null;
}

function parsePartHeaders(rawHeaderText) {
    const headers = {};
    const lines = rawHeaderText.split('\r\n');
    for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx <= 0) continue;
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const value = line.slice(colonIdx + 1).trim();
        headers[key] = value;
    }
    return headers;
}

function parseContentDisposition(disposition = '') {
    const nameMatch = disposition.match(/\bname="([^"]*)"/i);
    const filenameMatch = disposition.match(/\bfilename="([^"]*)"/i);
    return {
        name: nameMatch ? nameMatch[1] : null,
        filename: filenameMatch ? filenameMatch[1] : null,
    };
}

/**
 * Parses a `multipart/form-data` buffer into `{ fields, files }` without corrupting binary payloads.
 *
 * @param {Buffer} bodyBuffer
 * @param {string} boundary
 * @returns {{ fields: Record<string, string>, files: Record<string, { filename: string, contentType: string, data: Buffer }> }}
 */
export function parseMultipartBuffer(bodyBuffer, boundary) {
    if (!boundary) {
        throw new MultipartUploadError('Cabeçalho multipart sem boundary válido.', 400);
    }

    const dashBoundary = Buffer.from(`--${boundary}`, 'utf8');
    const fields = {};
    const files = {};

    let cursor = bodyBuffer.indexOf(dashBoundary);
    if (cursor === -1) {
        throw new MultipartUploadError('Corpo multipart inválido.', 400);
    }

    while (cursor !== -1) {
        cursor += dashBoundary.length;

        // Closing boundary `--boundary--`
        if (bodyBuffer[cursor] === 0x2d && bodyBuffer[cursor + 1] === 0x2d) {
            break;
        }

        // Expect CRLF after `--boundary`
        if (bodyBuffer[cursor] === 0x0d && bodyBuffer[cursor + 1] === 0x0a) {
            cursor += 2;
        } else if (bodyBuffer[cursor] === 0x0a) {
            cursor += 1;
        }

        const nextBoundary = bodyBuffer.indexOf(dashBoundary, cursor);
        if (nextBoundary === -1) {
            break;
        }

        // Part ends with `\r\n` right before `--boundary`
        let partEnd = nextBoundary;
        if (bodyBuffer[partEnd - 2] === 0x0d && bodyBuffer[partEnd - 1] === 0x0a) {
            partEnd -= 2;
        } else if (bodyBuffer[partEnd - 1] === 0x0a) {
            partEnd -= 1;
        }

        const partSlice = bodyBuffer.subarray(cursor, partEnd);
        const headerEnd = partSlice.indexOf(CRLF2);
        if (headerEnd === -1) {
            cursor = nextBoundary;
            continue;
        }

        const headerText = partSlice.subarray(0, headerEnd).toString('utf8');
        const contentSlice = partSlice.subarray(headerEnd + CRLF2.length);
        const headers = parsePartHeaders(headerText);
        const { name, filename } = parseContentDisposition(headers['content-disposition']);

        if (name) {
            if (filename !== null) {
                files[name] = {
                    filename,
                    contentType: headers['content-type'] || 'application/octet-stream',
                    data: Buffer.from(contentSlice),
                };
            } else {
                fields[name] = contentSlice.toString('utf8');
            }
        }

        cursor = nextBoundary;
    }

    return { fields, files };
}

/**
 * Reads and parses a `multipart/form-data` or raw `application/zip` request.
 *
 * @param {import('express').Request} req
 * @param {{ maxBytes?: number }} [options]
 */
export async function parseMultipartRequest(req, options = {}) {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
    const contentType = String(req.headers['content-type'] || '');

    if (contentType.toLowerCase().startsWith('multipart/form-data')) {
        const boundary = extractBoundary(contentType);
        if (!boundary) {
            throw new MultipartUploadError('Boundary ausente no envio multipart/form-data.', 400);
        }
        const rawBody = await readStreamWithLimit(req, maxBytes);
        return parseMultipartBuffer(rawBody, boundary);
    }

    if (
        contentType.toLowerCase().includes('application/zip') ||
        contentType.toLowerCase().includes('application/x-zip-compressed') ||
        contentType.toLowerCase().includes('application/octet-stream')
    ) {
        const rawBody = await readStreamWithLimit(req, maxBytes);
        return {
            fields: {},
            files: {
                backupFile: {
                    filename: 'backup.zip',
                    contentType,
                    data: rawBody,
                },
            },
        };
    }

    throw new MultipartUploadError('Formato de envio não suportado. Envie um arquivo .zip via formulário.', 400);
}
