import mongoose from 'mongoose';
import db from '../db.js';
import logger from './logger.js';
import { createZip, extractZip } from './zipArchive.js';

const { EJSON } = mongoose.mongo.BSON;

export const BACKUP_APP_ID = 'lembrador-contas';
export const BACKUP_FORMAT_VERSION = 1;

export class BackupValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BackupValidationError';
        this.status = 400;
    }
}

export const BACKUP_COLLECTIONS = [
    {
        key: 'users',
        label: 'Usuários',
        collection: 'usercollection',
        file: 'collections/users.json',
        getModel: () => db.User,
        requiredStringFields: ['name', 'email'],
    },
    {
        key: 'tables',
        label: 'Tabelas',
        collection: 'tablecollection',
        file: 'collections/tables.json',
        getModel: () => db.Table,
        requiredStringFields: ['name'],
    },
    {
        key: 'emails',
        label: 'E-mails',
        collection: 'emailcollection',
        file: 'collections/emails.json',
        getModel: () => db.Email,
        requiredStringFields: ['address', 'subject'],
    },
    {
        key: 'apis',
        label: 'APIs',
        collection: 'apicollection',
        file: 'collections/apis.json',
        getModel: () => db.API,
        requiredStringFields: ['name', 'url', 'value'],
    },
    {
        key: 'bills',
        label: 'Contas cadastradas',
        collection: 'billcollection',
        file: 'collections/bills.json',
        getModel: () => db.Bill,
        requiredStringFields: ['name', 'company', 'valueSourceType', 'valueSourceId'],
    },
    {
        key: 'activeBills',
        label: 'Demonstrativo mensal (contas ativas)',
        collection: 'activebillcollection',
        file: 'collections/activeBills.json',
        getModel: () => db.ActiveBill,
        requiredStringFields: ['name', 'referencePeriod'],
    },
    {
        key: 'billReminders',
        label: 'Lembretes enviados',
        collection: 'billremindercollection',
        file: 'collections/billReminders.json',
        getModel: () => db.BillReminder,
        requiredStringFields: ['title', 'status'],
    },
    {
        key: 'pushSubscriptions',
        label: 'Inscrições Push',
        collection: 'pushnotificationsubscriptioncollection',
        file: 'collections/pushSubscriptions.json',
        getModel: () => db.PushNotificationSubscription,
        requiredStringFields: ['endpoint'],
    },
];

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DATE_FIELDS = new Set(['dueDate', 'notifiedAt', 'expirationTime', 'created_at', 'updated_at']);
const OBJECT_ID_REF_FIELDS = new Set(['activeBill']);

function sanitizeValue(value) {
    if (value === null || value === undefined) return value;
    if (value instanceof Date || value instanceof mongoose.Types.ObjectId) return value;
    if (typeof value?._bsontype === 'string') return value;
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (typeof value === 'object') {
        const clean = {};
        for (const [k, v] of Object.entries(value)) {
            if (FORBIDDEN_KEYS.has(k) || k.startsWith('$')) continue;
            clean[k] = sanitizeValue(v);
        }
        return clean;
    }
    return value;
}

function toObjectIdIfValid(val) {
    if (val instanceof mongoose.Types.ObjectId) return val;
    if (typeof val === 'string' && /^[a-fA-F0-9]{24}$/.test(val)) {
        return new mongoose.Types.ObjectId(val);
    }
    return val;
}

function normalizeDocument(rawDoc, descriptor) {
    if (!rawDoc || typeof rawDoc !== 'object' || Array.isArray(rawDoc)) {
        throw new BackupValidationError(`Documento inválido na coleção "${descriptor.label}".`);
    }

    const doc = sanitizeValue(rawDoc);

    for (const field of descriptor.requiredStringFields) {
        if (typeof doc[field] !== 'string' || doc[field].trim() === '') {
            throw new BackupValidationError(
                `Campo obrigatório "${field}" ausente ou inválido em "${descriptor.label}".`
            );
        }
    }

    if (doc._id !== undefined) {
        doc._id = toObjectIdIfValid(doc._id);
    }

    if (Array.isArray(doc.users)) {
        doc.users = doc.users.map(u => {
            if (u && typeof u === 'object' && !(u instanceof mongoose.Types.ObjectId) && u._id !== undefined) {
                return toObjectIdIfValid(u._id);
            }
            return toObjectIdIfValid(u);
        });
    }

    for (const field of OBJECT_ID_REF_FIELDS) {
        if (doc[field] !== undefined && doc[field] !== null) {
            doc[field] = toObjectIdIfValid(doc[field]);
        }
    }

    for (const field of DATE_FIELDS) {
        if (typeof doc[field] === 'string' && doc[field].trim() !== '') {
            const parsed = new Date(doc[field]);
            if (Number.isNaN(parsed.getTime())) {
                throw new BackupValidationError(
                    `Data inválida no campo "${field}" em "${descriptor.label}".`
                );
            }
            doc[field] = parsed;
        }
    }

    return doc;
}

function formatBackupTimestamp(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return [
        date.getFullYear(),
        '-',
        pad(date.getMonth() + 1),
        '-',
        pad(date.getDate()),
        '-',
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
    ].join('');
}

async function fetchCollectionDocs(Model) {
    const query = Model.find({});
    const docs = typeof query?.lean === 'function' ? await query.lean() : await query;
    return Array.isArray(docs) ? docs.map(doc => ({ ...doc })) : [];
}

async function clearCollection(Model) {
    if (typeof Model.collection?.deleteMany === 'function') {
        await Model.collection.deleteMany({});
        return;
    }
    const res = Model.deleteMany({});
    if (res && typeof res.lean === 'function') {
        const leaned = res.lean();
        if (leaned && typeof leaned.exec === 'function') {
            await leaned.exec();
            return;
        }
    }
    await res;
}

async function insertCollectionDocs(Model, docs) {
    if (!docs || docs.length === 0) return;
    if (typeof Model.collection?.insertMany === 'function') {
        await Model.collection.insertMany(docs, { ordered: true });
        return;
    }
    if (typeof Model.insertMany === 'function') {
        await Model.insertMany(docs, { ordered: true });
        return;
    }
    for (const doc of docs) {
        const instance = new Model(doc);
        await instance.save();
    }
}

async function mergeCollectionDocs(Model, docs) {
    if (!docs || docs.length === 0) return;

    if (typeof Model.collection?.bulkWrite === 'function') {
        const ops = docs.map(doc => {
            if (doc._id !== undefined) {
                return {
                    replaceOne: {
                        filter: { _id: doc._id },
                        replacement: doc,
                        upsert: true,
                    },
                };
            }
            return { insertOne: { document: doc } };
        });
        await Model.collection.bulkWrite(ops, { ordered: true });
        return;
    }

    if (typeof Model.bulkWrite === 'function') {
        const ops = docs.map(doc => {
            if (doc._id !== undefined) {
                return {
                    replaceOne: {
                        filter: { _id: doc._id },
                        replacement: doc,
                        upsert: true,
                    },
                };
            }
            return { insertOne: { document: doc } };
        });
        await Model.bulkWrite(ops, { ordered: true });
        return;
    }

    for (const doc of docs) {
        const instance = new Model(doc);
        await instance.save();
    }
}

/**
 * Returns current document counts for every backed-up collection.
 */
export async function getDatabaseStats() {
    const items = await Promise.all(
        BACKUP_COLLECTIONS.map(async (descriptor) => {
            const docs = await fetchCollectionDocs(descriptor.getModel());
            return {
                key: descriptor.key,
                label: descriptor.label,
                count: docs.length,
            };
        })
    );
    const totalDocuments = items.reduce((sum, item) => sum + item.count, 0);
    return { collections: items, totalDocuments };
}

/**
 * Exports all application collections into a compressed `.zip` backup archive.
 *
 * @returns {Promise<{ buffer: Buffer, filename: string, manifest: object }>}
 */
export async function createBackupZip() {
    const now = new Date();
    const exported = await Promise.all(
        BACKUP_COLLECTIONS.map(async (descriptor) => {
            const docs = await fetchCollectionDocs(descriptor.getModel());
            return { descriptor, docs };
        })
    );

    const manifestCollections = {};
    const zipEntries = [];

    for (const { descriptor, docs } of exported) {
        manifestCollections[descriptor.key] = {
            label: descriptor.label,
            collection: descriptor.collection,
            file: descriptor.file,
            count: docs.length,
        };
        const serialized = EJSON.stringify(docs, null, 2, { relaxed: true });
        zipEntries.push({
            name: descriptor.file,
            data: Buffer.from(serialized, 'utf8'),
            date: now,
        });
    }

    const manifest = {
        app: BACKUP_APP_ID,
        formatVersion: BACKUP_FORMAT_VERSION,
        createdAt: now.toISOString(),
        collections: manifestCollections,
    };

    zipEntries.unshift({
        name: 'manifest.json',
        data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
        date: now,
    });

    const buffer = createZip(zipEntries);
    const filename = `lembrador-contas-backup-${formatBackupTimestamp(now)}.zip`;

    return { buffer, filename, manifest };
}

function parseAndValidateBackupArchive(zipBuffer) {
    if (!zipBuffer || zipBuffer.length === 0) {
        throw new BackupValidationError('Nenhum arquivo ZIP válido foi enviado.');
    }

    let files;
    try {
        files = extractZip(zipBuffer);
    } catch (err) {
        throw new BackupValidationError(err.message || 'Arquivo ZIP inválido ou corrompido.');
    }

    const manifestRaw = files.get('manifest.json');
    if (!manifestRaw) {
        throw new BackupValidationError('O arquivo ZIP não contém o manifesto de backup (manifest.json).');
    }

    let manifest;
    try {
        manifest = JSON.parse(manifestRaw.toString('utf8'));
    } catch {
        throw new BackupValidationError('O arquivo manifest.json do backup contém JSON inválido.');
    }

    if (!manifest || typeof manifest !== 'object' || manifest.app !== BACKUP_APP_ID) {
        throw new BackupValidationError('Este arquivo ZIP não é um backup válido do Lembrador de Contas.');
    }

    if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
        throw new BackupValidationError(
            `Versão de formato de backup não suportada (${manifest.formatVersion}).`
        );
    }

    const parsedCollections = new Map();
    let hasAtLeastOneCollectionFile = false;

    for (const descriptor of BACKUP_COLLECTIONS) {
        const declaredFile = manifest.collections?.[descriptor.key]?.file || descriptor.file;
        const rawEntry = files.get(declaredFile);
        if (!rawEntry) {
            parsedCollections.set(descriptor.key, []);
            continue;
        }

        hasAtLeastOneCollectionFile = true;
        let parsedDocs;
        try {
            parsedDocs = EJSON.parse(rawEntry.toString('utf8'), { relaxed: true });
        } catch {
            throw new BackupValidationError(
                `O arquivo "${declaredFile}" no backup contém JSON inválido.`
            );
        }

        if (!Array.isArray(parsedDocs)) {
            throw new BackupValidationError(
                `O conteúdo de "${declaredFile}" deve ser uma lista de documentos.`
            );
        }

        const normalizedDocs = parsedDocs.map(doc => normalizeDocument(doc, descriptor));
        parsedCollections.set(descriptor.key, normalizedDocs);
    }

    if (!hasAtLeastOneCollectionFile) {
        throw new BackupValidationError('O arquivo ZIP de backup não contém arquivos de coleções.');
    }

    return { manifest, parsedCollections };
}

/**
 * Imports a `.zip` backup archive into MongoDB.
 *
 * Modes:
 * - `replace`: Replaces all documents in all backed-up collections (rolls back from in-memory snapshot if any write fails).
 * - `merge`: Upserts documents from the backup by `_id`, keeping existing records that are not in the backup.
 *
 * @param {Buffer} zipBuffer
 * @param {{ mode?: 'replace' | 'merge' }} [options]
 */
export async function importBackupZip(zipBuffer, options = {}) {
    const mode = options.mode || 'replace';
    if (mode !== 'replace' && mode !== 'merge') {
        throw new BackupValidationError('Modo de importação inválido. Use "replace" ou "merge".');
    }

    // 1. Validate entire archive and normalize all documents BEFORE touching the DB
    const { manifest, parsedCollections } = parseAndValidateBackupArchive(zipBuffer);

    // 2. Take pre-import snapshot for automatic rollback on unexpected DB failure
    const snapshot = new Map();
    for (const descriptor of BACKUP_COLLECTIONS) {
        const currentDocs = await fetchCollectionDocs(descriptor.getModel());
        snapshot.set(descriptor.key, currentDocs);
    }

    const summaryCounts = {};
    let totalImported = 0;

    try {
        for (const descriptor of BACKUP_COLLECTIONS) {
            const Model = descriptor.getModel();
            const docs = parsedCollections.get(descriptor.key) || [];

            if (mode === 'replace') {
                await clearCollection(Model);
                await insertCollectionDocs(Model, docs);
            } else {
                await mergeCollectionDocs(Model, docs);
            }

            summaryCounts[descriptor.key] = {
                label: descriptor.label,
                count: docs.length,
            };
            totalImported += docs.length;
        }
    } catch (err) {
        logger.error({ err, mode }, 'Database backup import failed; rolling back to pre-import snapshot');
        for (const descriptor of BACKUP_COLLECTIONS) {
            try {
                const Model = descriptor.getModel();
                await clearCollection(Model);
                await insertCollectionDocs(Model, snapshot.get(descriptor.key) || []);
            } catch (rollbackErr) {
                logger.error({ err: rollbackErr, collection: descriptor.key }, 'Rollback failed for collection');
            }
        }
        throw err;
    }

    return {
        mode,
        backupCreatedAt: manifest.createdAt || null,
        totalImported,
        collections: summaryCounts,
    };
}
