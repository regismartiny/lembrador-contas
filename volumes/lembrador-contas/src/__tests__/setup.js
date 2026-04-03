import { mock } from 'bun:test';

// Prevent db.js from connecting to MongoDB during tests
mock.module('../db.js', () => {
    class MockActiveBill {
        constructor(data) { Object.assign(this, data); }
        save() { return Promise.resolve(this); }
    }
    const makeQuery = (result) => ({ lean: () => Promise.resolve(result) });
    return {
        default: {
            BillTypeEnum:       { RECURRENT_SERVICE: 'Serviço Recorrente', PURCHASE: 'Compra' },
            ValueSourceTypeEnum:{ TABLE: 'Tabela', EMAIL: 'Email', API: 'API' },
            ActiveBillStatusEnum: { UNPAID: 'Não pago', PAID: 'Pago', ERROR: 'Erro' },
            PaymentTypeEnum:    { PIX: 'PIX', DINHEIRO: 'Dinheiro' },
            ActiveBill: MockActiveBill,
            Table: { findById: () => makeQuery(null), deleteMany: () => Promise.resolve() },
            Email: { findById: () => makeQuery(null) },
            API:   { findById: () => makeQuery(null) },
            Bill:  { findById: () => makeQuery(null), find: () => makeQuery([]) },
            User:  { findById: () => makeQuery(null), find: () => makeQuery([]) },
        }
    };
});

mock.module('../util/logger.js', () => ({
    default: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }
}));
