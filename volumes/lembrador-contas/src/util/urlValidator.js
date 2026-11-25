function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) {
        return false;
    }
    const [a, b] = parts;
    if (a === 127) return true;                          // 127.0.0.0/8 loopback
    if (a === 10) return true;                           // 10.0.0.0/8 private
    if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true;             // 192.168.0.0/16 private
    if (a === 169 && b === 254) return true;             // 169.254.0.0/16 link-local / metadata
    if (a === 0) return true;                            // 0.0.0.0/8 unspecified
    if (a === 100 && b >= 64 && b <= 127) return true;   // 100.64.0.0/10 CGNAT
    return false;
}

function isPrivateHostname(hostname) {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();

    if (
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host.endsWith('.local') ||
        host.endsWith('.internal')
    ) {
        return true;
    }

    if (isPrivateIPv4(host)) {
        return true;
    }

    // IPv6 loopback, unspecified, ULA (fc00::/7), link-local (fe80::/10)
    if (
        host === '::1' ||
        host === '::' ||
        host === '0:0:0:0:0:0:0:1' ||
        host === '0:0:0:0:0:0:0:0' ||
        /^f[cd][0-9a-f]{0,2}:/i.test(host) ||
        /^fe[89ab][0-9a-f]?:/i.test(host)
    ) {
        return true;
    }

    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (host.startsWith('::ffff:')) {
        const mapped = host.slice(7);
        if (isPrivateIPv4(mapped)) {
            return true;
        }
        const hexMatch = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
        if (hexMatch) {
            const hi = parseInt(hexMatch[1], 16);
            const lo = parseInt(hexMatch[2], 16);
            const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
            if (isPrivateIPv4(ipv4)) {
                return true;
            }
        }
    }

    return false;
}

export function validateExternalApiUrl(urlStr) {
    if (typeof urlStr !== 'string' || !urlStr.trim()) {
        return { valid: false, error: 'URL é obrigatória.' };
    }

    let parsed;
    try {
        parsed = new URL(urlStr.trim());
    } catch {
        return { valid: false, error: 'URL inválida.' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, error: 'URL deve usar protocolo HTTP ou HTTPS.' };
    }

    if (process.env.ALLOW_PRIVATE_API_URLS !== 'true' && isPrivateHostname(parsed.hostname)) {
        return { valid: false, error: 'URL aponta para um endereço interno ou privado não permitido.' };
    }

    return { valid: true, url: parsed };
}

export default { validateExternalApiUrl };
