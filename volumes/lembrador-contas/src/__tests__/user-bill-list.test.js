import { describe, test, expect } from 'bun:test';
import ejs from 'ejs';
import { fileURLToPath } from 'url';

describe('user bill list template', () => {
    test('marks the actions column as edit-mode-only', async () => {
        const templatePath = fileURLToPath(new URL('../views/dashboard/user-bill-list.ejs', import.meta.url));
        const html = await ejs.renderFile(templatePath, {
            userBillsData: {
                billListPerMonth: [{
                    month: '10/2026',
                    totalValue: 10,
                    paymentTypeSummaries: [],
                    billList: [{ _id: 'bill-id', name: 'Conta', value: 10 }],
                }],
            },
            isAdmin: true,
            currentMonth: 10,
            currentYear: 2026,
            csrfToken: '',
        });

        expect(html).toContain('<th class="text-right hidden-edit-mode">Ações</th>');
    });

    test('hides the non-admin actions cell outside edit mode', async () => {
        const templatePath = fileURLToPath(new URL('../views/dashboard/user-bill-list.ejs', import.meta.url));
        const html = await ejs.renderFile(templatePath, {
            userBillsData: {
                billListPerMonth: [{
                    month: '10/2026',
                    totalValue: 10,
                    paymentTypeSummaries: [],
                    billList: [{ _id: 'bill-id', name: 'Conta', value: 10 }],
                }],
            },
            isAdmin: false,
            currentMonth: 10,
            currentYear: 2026,
            csrfToken: '',
        });

        expect(html).toContain('<td class="text-right text-muted small hidden-edit-mode">Somente admin</td>');
    });
});
