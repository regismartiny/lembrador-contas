import zlib from 'node:zlib';

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;

const VERSION_NEEDED = 20; // PKZIP 2.0
const UTF8_FLAG = 0x0800;  // General purpose bit 11: UTF-8 filename
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

const DEFAULT_MAX_ENTRIES = 64;
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MB

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

export function computeCrc32(buffer) {
    if (typeof zlib.crc32 === 'function') {
        return zlib.crc32(buffer) >>> 0;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) {
        crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function dateToDosDateTime(date = new Date()) {
    const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()));
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = Math.floor(date.getUTCSeconds() / 2);

    const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
    const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
    return { dosTime, dosDate };
}

export function validateSafeEntryName(entryName) {
    if (typeof entryName !== 'string' || entryName.length === 0 || entryName.length > 512) {
        throw new Error('Nome de arquivo inválido no pacote ZIP.');
    }
    if (entryName.includes('\0') || entryName.includes('\\') || entryName.startsWith('/')) {
        throw new Error(`Caminho inseguro no pacote ZIP: "${entryName}".`);
    }
    const segments = entryName.split('/');
    if (segments.some(seg => seg === '..' || seg === '.')) {
        throw new Error(`Caminho relativo inválido no pacote ZIP: "${entryName}".`);
    }
}

/**
 * Creates a standard PKZIP buffer from an array of `{ name, data, date? }` entries.
 *
 * @param {Array<{ name: string, data: Buffer | Uint8Array | string, date?: Date }>} entries
 * @returns {Buffer}
 */
export function createZip(entries) {
    if (!Array.isArray(entries)) {
        throw new TypeError('entries must be an array');
    }

    const localChunks = [];
    const centralChunks = [];
    let offset = 0;

    for (const entry of entries) {
        validateSafeEntryName(entry.name);

        const nameBuf = Buffer.from(entry.name, 'utf8');
        const rawData = Buffer.isBuffer(entry.data)
            ? entry.data
            : typeof entry.data === 'string'
                ? Buffer.from(entry.data, 'utf8')
                : Buffer.from(entry.data);

        const crc = computeCrc32(rawData);
        const compressed = rawData.length > 0 ? zlib.deflateRawSync(rawData, { level: 6 }) : Buffer.alloc(0);
        const useDeflate = rawData.length > 0 && compressed.length < rawData.length;
        const payload = useDeflate ? compressed : rawData;
        const method = useDeflate ? METHOD_DEFLATE : METHOD_STORE;
        const { dosTime, dosDate } = dateToDosDateTime(entry.date || new Date());

        const localHeader = Buffer.alloc(30 + nameBuf.length);
        localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIG, 0);
        localHeader.writeUInt16LE(VERSION_NEEDED, 4);
        localHeader.writeUInt16LE(UTF8_FLAG, 6);
        localHeader.writeUInt16LE(method, 8);
        localHeader.writeUInt16LE(dosTime, 10);
        localHeader.writeUInt16LE(dosDate, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(payload.length, 18);
        localHeader.writeUInt32LE(rawData.length, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28); // extra field length
        nameBuf.copy(localHeader, 30);

        localChunks.push(localHeader, payload);

        const centralHeader = Buffer.alloc(46 + nameBuf.length);
        centralHeader.writeUInt32LE(CENTRAL_DIR_HEADER_SIG, 0);
        centralHeader.writeUInt16LE(VERSION_NEEDED, 4); // version made by
        centralHeader.writeUInt16LE(VERSION_NEEDED, 6); // version needed
        centralHeader.writeUInt16LE(UTF8_FLAG, 8);
        centralHeader.writeUInt16LE(method, 10);
        centralHeader.writeUInt16LE(dosTime, 12);
        centralHeader.writeUInt16LE(dosDate, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(payload.length, 20);
        centralHeader.writeUInt32LE(rawData.length, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30); // extra field length
        centralHeader.writeUInt16LE(0, 32); // file comment length
        centralHeader.writeUInt16LE(0, 34); // disk number start
        centralHeader.writeUInt16LE(0, 36); // internal file attributes
        centralHeader.writeUInt32LE(0, 38); // external file attributes
        centralHeader.writeUInt32LE(offset, 42); // relative offset of local header
        nameBuf.copy(centralHeader, 46);

        centralChunks.push(centralHeader);
        offset += localHeader.length + payload.length;
    }

    const centralDirSize = centralChunks.reduce((sum, buf) => sum + buf.length, 0);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(END_OF_CENTRAL_DIR_SIG, 0);
    eocd.writeUInt16LE(0, 4); // number of this disk
    eocd.writeUInt16LE(0, 6); // disk where central directory starts
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDirSize, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20); // comment length

    return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

function findEndOfCentralDirectory(buffer) {
    const minEocdSize = 22;
    if (!Buffer.isBuffer(buffer) || buffer.length < minEocdSize) {
        return -1;
    }
    const maxCommentLength = 0xffff;
    const minOffset = Math.max(0, buffer.length - minEocdSize - maxCommentLength);

    for (let pos = buffer.length - minEocdSize; pos >= minOffset; pos--) {
        if (buffer.readUInt32LE(pos) === END_OF_CENTRAL_DIR_SIG) {
            const commentLen = buffer.readUInt16LE(pos + 20);
            if (pos + minEocdSize + commentLen === buffer.length) {
                return pos;
            }
        }
    }
    return -1;
}

/**
 * Extracts entries from a PKZIP buffer with safety checks against path traversal,
 * corrupt CRC32 checksums, and zip-bomb decompression limits.
 *
 * @param {Buffer | Uint8Array} inputBuffer
 * @param {{ maxEntries?: number, maxTotalUncompressedBytes?: number }} [options]
 * @returns {Map<string, Buffer>}
 */
export function extractZip(inputBuffer, options = {}) {
    const buffer = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer || []);
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const maxTotalUncompressedBytes = options.maxTotalUncompressedBytes ?? DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES;

    const eocdOffset = findEndOfCentralDirectory(buffer);
    if (eocdOffset < 0) {
        throw new Error('Arquivo ZIP inválido ou corrompido.');
    }

    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
    const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

    if (totalEntries === 0xffff || centralDirSize === 0xffffffff || centralDirOffset === 0xffffffff) {
        throw new Error('Arquivos ZIP64 não são suportados.');
    }

    if (totalEntries > maxEntries) {
        throw new Error(`O arquivo ZIP excede o limite permitido de ${maxEntries} entradas.`);
    }

    if (centralDirOffset + centralDirSize > eocdOffset) {
        throw new Error('Diretório central do arquivo ZIP está corrompido.');
    }

    const files = new Map();
    let cdCursor = centralDirOffset;
    let totalUncompressed = 0;

    for (let i = 0; i < totalEntries; i++) {
        if (cdCursor + 46 > eocdOffset || buffer.readUInt32LE(cdCursor) !== CENTRAL_DIR_HEADER_SIG) {
            throw new Error('Cabeçalho do diretório central ZIP inválido.');
        }

        const flags = buffer.readUInt16LE(cdCursor + 8);
        const method = buffer.readUInt16LE(cdCursor + 10);
        const expectedCrc = buffer.readUInt32LE(cdCursor + 16);
        const compressedSize = buffer.readUInt32LE(cdCursor + 20);
        const uncompressedSize = buffer.readUInt32LE(cdCursor + 24);
        const fileNameLen = buffer.readUInt16LE(cdCursor + 28);
        const extraLen = buffer.readUInt16LE(cdCursor + 30);
        const commentLen = buffer.readUInt16LE(cdCursor + 32);
        const localHeaderOffset = buffer.readUInt32LE(cdCursor + 42);

        if ((flags & 0x0001) !== 0) {
            throw new Error('Arquivos ZIP criptografados com senha não são suportados.');
        }

        const cdEntryEnd = cdCursor + 46 + fileNameLen + extraLen + commentLen;
        if (cdEntryEnd > eocdOffset) {
            throw new Error('Entrada do diretório central ZIP truncada.');
        }

        const entryName = buffer.subarray(cdCursor + 46, cdCursor + 46 + fileNameLen).toString('utf8');
        cdCursor = cdEntryEnd;

        // Skip directory entries
        if (entryName.endsWith('/')) {
            const dirTrimmed = entryName.replace(/\/+$/, '');
            if (dirTrimmed) validateSafeEntryName(dirTrimmed);
            continue;
        }

        validateSafeEntryName(entryName);

        totalUncompressed += uncompressedSize;
        if (totalUncompressed > maxTotalUncompressedBytes) {
            throw new Error('Conteúdo descompactado do backup excede o tamanho máximo permitido.');
        }

        if (localHeaderOffset + 30 > centralDirOffset || buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER_SIG) {
            throw new Error(`Cabeçalho local inválido para "${entryName}".`);
        }

        const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
        const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const dataEnd = dataStart + compressedSize;

        if (dataEnd > centralDirOffset) {
            throw new Error(`Dados compactados truncados para "${entryName}".`);
        }

        const compressedSlice = buffer.subarray(dataStart, dataEnd);
        const remainingAllowance = maxTotalUncompressedBytes - (totalUncompressed - uncompressedSize);

        let fileData;
        if (method === METHOD_STORE) {
            if (compressedSlice.length > remainingAllowance) {
                throw new Error('Conteúdo descompactado do backup excede o tamanho máximo permitido.');
            }
            fileData = Buffer.from(compressedSlice);
        } else if (method === METHOD_DEFLATE) {
            try {
                fileData = zlib.inflateRawSync(compressedSlice, {
                    maxOutputLength: remainingAllowance,
                });
            } catch (err) {
                if (err?.code === 'ERR_BUFFER_TOO_LARGE') {
                    throw new Error('Conteúdo descompactado do backup excede o tamanho máximo permitido.', { cause: err });
                }
                throw new Error(`Falha ao descompactar "${entryName}" do arquivo ZIP.`, { cause: err });
            }
        } else {
            throw new Error(`Método de compressão ZIP não suportado (${method}) em "${entryName}".`);
        }

        if (fileData.length !== uncompressedSize) {
            throw new Error(`Tamanho descompactado inconsistente para "${entryName}".`);
        }

        const actualCrc = computeCrc32(fileData);
        if (actualCrc !== expectedCrc) {
            throw new Error(`Falha na verificação de integridade (CRC32) de "${entryName}".`);
        }

        files.set(entryName, fileData);
    }

    return files;
}
