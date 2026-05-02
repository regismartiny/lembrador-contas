import { mock } from 'bun:test';

// Required by app.js at import time — prevents process.exit(1)
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-for-testing';

// Ensure APP_PASSWORD is unset for tests so requireAuth calls next() immediately
process.env.APP_PASSWORD = undefined;

// Mock CSRF middleware to allow POST requests in tests
mock.module('../middleware/csrf.js', () => ({
    generateToken: (req, res) => 'test-csrf-token',
    doubleCsrfProtection: (req, res, next) => next(),
}));

// Mock auth middleware to always allow access
mock.module('../middleware/auth.js', () => ({
    requireAuth: (req, res, next) => next(),
    requireAdmin: (req, res, next) => next(),
    cloudflareAuth: (req, res, next) => next(),
}));

// Mock Gmail client to prevent OAuth calls at import time
mock.module('../util/gmail.js', () => ({
    default: {
        listUnreadMessages: (cb) => cb([]),
        getMessage: (id, fields, cb) => cb(null),
        findMessages: () => Promise.resolve([]),
        getAttachments: () => Promise.resolve(null),
    }
}));

// Mock web-push to prevent external API calls
mock.module('web-push', () => ({
    default: {
        sendNotification: () => Promise.resolve(),
        setVapidDetails: () => {},
        generateVAPIDKeys: () => ({ publicKey: 'test', privateKey: 'test' }),
    }
}));

// Returns a Promise that also has a .lean() method (mirrors Mongoose query API).
// This lets both `await Model.find()` and `await Model.find().lean()` work.
function makeQuery(result) {
    const p = Promise.resolve(result);
    p.lean = () => Promise.resolve(result);
    return p;
}

// Configurable mock data — route tests can import and modify before running
export const mockData = {
    activeBills: [],
    users: [],
    bills: [],
    tables: [],
    emails: [],
    apis: [],
    pushSubscriptions: [],
};

export function resetMockData() {
    mockData.activeBills.length = 0;
    mockData.users.length = 0;
    mockData.bills.length = 0;
    mockData.tables.length = 0;
    mockData.emails.length = 0;
    mockData.apis.length = 0;
    mockData.pushSubscriptions.length = 0;
}

// Prevent db.js from connecting to MongoDB during tests
mock.module('../db.js', () => {
    class MockActiveBill {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
        static find()                   { return makeQuery(mockData.activeBills); }
        static findById()               { return makeQuery(null); }
        static findOneAndUpdate()       { return makeQuery(null); }
        static deleteMany()             { return makeQuery({ deletedCount: 0 }); }
        static collection = { createIndex: () => Promise.resolve() };
    }

    class MockBill {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
        static find()                   { return makeQuery(mockData.bills); }
        static findById()               { return makeQuery(null); }
        static findOneAndUpdate()       { return makeQuery(null); }
        static findOneAndDelete()       { return makeQuery(null); }
    }

    class MockUser {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
        static find()                   { return makeQuery(mockData.users); }
        static findById()               { return makeQuery(null); }
        static findOne(query) {
            // Return test users for auth-integration tests
            const testUsers = [
                { _id: '1', email: 'admin@example.com', name: 'Admin User', admin: true },
                { _id: '2', email: 'user@example.com', name: 'Regular User', admin: false },
                { _id: '3', email: 'nonadmin@example.com', name: 'Non-admin User', admin: false }
            ];
            const user = testUsers.find(u => u.email === query?.email);
            return makeQuery(user);
        }
        static findOneAndUpdate()       { return makeQuery(null); }
        static findOneAndDelete()       { return makeQuery(null); }
    }

    class MockTable {
        constructor(data) { Object.assign(this, data); }
        save() { mockData.tables.push(this); return Promise.resolve(this); }
        static find()                   { return makeQuery(mockData.tables); }
        static findById(id)             { const t = mockData.tables.find(x => x._id === id || x.name === id); return makeQuery(t || null); }
        static findOneAndUpdate()       { return makeQuery(null); }
        static findOneAndDelete()       { return makeQuery(null); }
    }

    class MockEmail {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
        static find()                   { return makeQuery(mockData.emails); }
        static findById()               { return makeQuery(null); }
        static findOneAndUpdate()       { return makeQuery(null); }
        static findOneAndDelete()       { return makeQuery(null); }
    }

    class MockAPI {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
        static find()                   { return makeQuery(mockData.apis); }
        static findById()               { return makeQuery(null); }
        static findOneAndUpdate()       { return makeQuery(null); }
        static findOneAndDelete()       { return makeQuery(null); }
    }

    // Supports chaining: .deleteMany().lean().exec()
    const execChain = { exec: () => Promise.resolve() };
    const leanChain = { lean: () => execChain };
    class MockPushNotificationSubscription {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
        static find()        { return makeQuery(mockData.pushSubscriptions); }
        static findById()    { return makeQuery(null); }
        static deleteMany()  { return leanChain; }
        static create()      { return Promise.resolve({}); }
    }

    // Return the default export object that db.js provides
    return {
        default: {
            Mongoose: null,
            User: MockUser,
            Bill: MockBill,
            ActiveBill: MockActiveBill,
            Email: MockEmail,
            Table: MockTable,
            API: MockAPI,
            BillReminder: null,
            PushNotificationSubscription: MockPushNotificationSubscription,
            PeriodFilterEnum: { ALL: 'ALL', CURRENT_AND_FUTURE: 'CURRENT_AND_FUTURE' },
            StatusEnum: { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' },
            HttpMethodEnum: { GET: 'GET', POST: 'POST', PUT: 'PUT', DELETE: 'DELETE' },
            ValueSourceTypeEnum: { TABLE: 'TABLE', EMAIL: 'EMAIL', API: 'API' },
            BillTypeEnum: { RECURRENT_SERVICE: 'RECURRENT_SERVICE', PURCHASE: 'PURCHASE' },
            PaymentTypeEnum: { PIX: 'PIX', BOLETO: 'BOLETO' },
            ActiveBillStatusEnum: { PENDING: 'PENDING', PAID: 'PAID' },
            DataTypeEnum: { BODY: 'Corpo do email', PDF_ATTACHMENT: 'Anexo PDF' },
            DataParserEnum: { CPFL_EMAIL: 'cpflEmailParser', CORSAN_EMAIL: 'corsanEmailParser' },
            ReminderStatusEnum: { CREATED: 'Criado', PAYD: 'Pago', CANCELED: 'Cancelado' },
        }
    };
});

// Mock logger to prevent console output during tests
mock.module('../util/logger.js', () => ({
    default: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }
}));
