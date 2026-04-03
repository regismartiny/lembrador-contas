import { mock } from 'bun:test';

// Returns a Promise that also has a .lean() method (mirrors Mongoose query API).
// This lets both `await Model.find()` and `await Model.find().lean()` work.
function makeQuery(result) {
    const p = Promise.resolve(result);
    p.lean = () => Promise.resolve(result);
    return p;
}

// Prevent db.js from connecting to MongoDB during tests
mock.module('../db.js', () => {
    class MockActiveBill {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
        static find()                   { return makeQuery([]); }
        static findById()               { return makeQuery(null); }
        static findOneAndUpdate()       { return makeQuery(null); }
        static deleteMany()             { return Promise.resolve({ deletedCount: 0 }); }
        static collection = { createIndex: () => Promise.resolve() };
    }

    class MockBill {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
        static find()                   { return makeQuery([]); }
        static findById()               { return makeQuery(null); }
        static findOneAndUpdate()       { return makeQuery(null); }
        static findOneAndDelete()       { return makeQuery(null); }
    }

    class MockUser {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
        static find()                   { return makeQuery([]); }
        static findById()               { return makeQuery(null); }
        static findOne()                { return makeQuery(null); }
        static findOneAndUpdate()       { return makeQuery(null); }
        static findOneAndDelete()       { return makeQuery(null); }
    }

    class MockTable {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
        static find()                   { return makeQuery([]); }
        static findById()               { return makeQuery(null); }
        static findOneAndUpdate()       { return makeQuery(null); }
        static findOneAndDelete()       { return makeQuery(null); }
    }

    class MockEmail {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
        static find()                   { return makeQuery([]); }
        static findById()               { return makeQuery(null); }
        static findOneAndUpdate()       { return makeQuery(null); }
        static findOneAndDelete()       { return makeQuery(null); }
    }

    class MockAPI {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
        static find()                   { return makeQuery([]); }
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
        static find()        { return makeQuery([]); }
        static findById()    { return makeQuery(null); }
        static deleteMany()  { return leanChain; }
        static create()      { return Promise.resolve({}); }
    }

    return {
        default: {
            BillTypeEnum:        { RECURRENT_SERVICE: 'Serviço Recorrente', PURCHASE: 'Compra' },
            ValueSourceTypeEnum: { TABLE: 'Tabela', EMAIL: 'Email', API: 'API' },
            ActiveBillStatusEnum:{ UNPAID: 'Não pago', PAID: 'Pago', ERROR: 'Erro' },
            PaymentTypeEnum:     { PIX: 'PIX', DINHEIRO: 'Dinheiro' },
            StatusEnum:          { ACTIVE: 'Ativo', INACTIVE: 'Inativo' },
            PeriodFilterEnum:    { CURRENT_AND_FUTURE: 'Mês atual e futuros', ALL: 'Todos' },
            HttpMethodEnum:      { GET: 'GET', POST: 'POST', PUT: 'PUT', DELETE: 'DELETE' },
            DataParserEnum:      { CPFL_EMAIL: 'cpflEmailParser', CORSAN_EMAIL: 'corsanEmailParser' },
            ReminderStatusEnum:  { CREATED: 'Criado', PAYD: 'Pago', CANCELED: 'Cancelado' },
            ActiveBill: MockActiveBill,
            Bill:       MockBill,
            User:       MockUser,
            Table:      MockTable,
            Email:      MockEmail,
            API:        MockAPI,
            PushNotificationSubscription: MockPushNotificationSubscription,
        }
    };
});

mock.module('../util/logger.js', () => ({
    default: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }
}));
