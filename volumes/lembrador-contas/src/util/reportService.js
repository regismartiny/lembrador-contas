import { ActiveBillStatusEnum, PaymentTypeEnum } from '../enums.js';

const MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const DEFAULT_STATUS_LABELS = {
    UNPAID: 'Não pago',
    PAID: 'Pago',
    ERROR: 'Erro',
};

const DEFAULT_PAYMENT_LABELS = {
    PIX: 'PIX',
    DINHEIRO: 'Dinheiro',
};

/**
 * Parses a period string in either `YYYY-MM` (HTML month input) or `MM/YYYY` (ActiveBill.referencePeriod)
 * into a normalized descriptor.
 */
export function parsePeriodInput(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let month;
    let year;

    const isoMatch = /^(\d{4})-(\d{1,2})$/.exec(trimmed);
    if (isoMatch) {
        year = Number(isoMatch[1]);
        month = Number(isoMatch[2]);
    } else {
        const brMatch = /^(\d{1,2})\/(\d{4})$/.exec(trimmed);
        if (brMatch) {
            month = Number(brMatch[1]);
            year = Number(brMatch[2]);
        }
    }

    if (!month || !year || month < 1 || month > 12 || year < 1900 || year > 9999) {
        return null;
    }

    const paddedMonth = String(month).padStart(2, '0');
    return {
        month,
        year,
        key: year * 12 + (month - 1),
        inputValue: `${year}-${paddedMonth}`,
        referencePeriod: `${paddedMonth}/${year}`,
        formatted: `${MONTH_NAMES_SHORT[month - 1]}/${year}`,
    };
}

export function formatReferencePeriod(referencePeriod) {
    const parsed = parsePeriodInput(referencePeriod);
    return parsed ? parsed.formatted : (referencePeriod || 'Sem período');
}

export function formatCurrencyBR(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return '—';
    }
    return Number(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function formatDateBR(dateValue) {
    if (!dateValue) return '—';
    const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function getStatusLabel(status, statusEnum) {
    return ActiveBillStatusEnum?.[status] || statusEnum?.[status] || DEFAULT_STATUS_LABELS[status] || status || 'Não pago';
}

function getPaymentLabel(paymentType, paymentEnum) {
    const normalized = paymentType || 'PIX';
    return PaymentTypeEnum?.[normalized] || paymentEnum?.[normalized] || DEFAULT_PAYMENT_LABELS[normalized] || normalized;
}

function extractUserId(userEntry) {
    if (!userEntry) return null;
    if (typeof userEntry === 'object' && userEntry._id !== undefined) {
        return String(userEntry._id);
    }
    return String(userEntry);
}

/**
 * Builds the complete report structure from ActiveBill and User collections.
 */
export function buildBillReport({
    activeBills = [],
    users = [],
    filters = {},
    statusEnum = ActiveBillStatusEnum,
    paymentEnum = PaymentTypeEnum,
} = {}) {
    const usersById = new Map();
    for (const user of users) {
        if (user && user._id !== undefined) {
            usersById.set(String(user._id), user);
        }
    }

    const requestedUserId = filters.userId && filters.userId !== 'ALL' ? String(filters.userId).trim() : 'ALL';
    const selectedUser = requestedUserId !== 'ALL' ? (usersById.get(requestedUserId) || null) : null;

    let startParsed = parsePeriodInput(filters.startPeriod);
    let endParsed = parsePeriodInput(filters.endPeriod);

    // Swap if startPeriod is after endPeriod so user gets an intuitive range
    if (startParsed && endParsed && startParsed.key > endParsed.key) {
        const tmp = startParsed;
        startParsed = endParsed;
        endParsed = tmp;
    }

    const normalizedFilters = {
        userId: requestedUserId,
        userName: requestedUserId === 'ALL'
            ? 'Todos os usuários (Consolidado)'
            : (selectedUser?.name || 'Usuário selecionado'),
        startPeriod: startParsed ? startParsed.inputValue : '',
        endPeriod: endParsed ? endParsed.inputValue : '',
        startLabel: startParsed ? startParsed.formatted : null,
        endLabel: endParsed ? endParsed.formatted : null,
    };

    const monthsMap = new Map();
    const userShareMap = new Map();
    const globalPaymentMap = new Map();

    let totalBills = 0;
    let totalValue = 0;
    let paidValue = 0;
    let paidCount = 0;
    let unpaidValue = 0;
    let unpaidCount = 0;
    let errorCount = 0;

    for (const rawBill of activeBills) {
        const periodDesc = parsePeriodInput(rawBill.referencePeriod);
        if (startParsed && (!periodDesc || periodDesc.key < startParsed.key)) {
            continue;
        }
        if (endParsed && (!periodDesc || periodDesc.key > endParsed.key)) {
            continue;
        }

        const billUserIds = (rawBill.users || [])
            .map(extractUserId)
            .filter(Boolean);

        if (requestedUserId !== 'ALL' && !billUserIds.includes(requestedUserId)) {
            continue;
        }

        const resolvedUsers = (rawBill.users || [])
            .map((entry) => {
                const id = extractUserId(entry);
                if (!id) return null;
                const known = usersById.get(id);
                const name = known?.name || (typeof entry === 'object' && entry.name ? entry.name : 'Usuário removido');
                return { id, name };
            })
            .filter(Boolean);

        const userCount = resolvedUsers.length || 1;
        const hasNumericValue = rawBill.value !== null && rawBill.value !== undefined && !Number.isNaN(Number(rawBill.value));
        const fullValue = hasNumericValue ? Number(rawBill.value) : null;
        const unitShare = fullValue !== null ? fullValue / userCount : null;
        const effectiveValue = requestedUserId === 'ALL' ? fullValue : unitShare;
        const numericEffective = effectiveValue ?? 0;

        const status = rawBill.status || 'UNPAID';
        const statusLabel = getStatusLabel(status, statusEnum);
        const paymentType = rawBill.paymentType || 'PIX';
        const paymentTypeLabel = getPaymentLabel(paymentType, paymentEnum);
        const monthKey = periodDesc ? periodDesc.referencePeriod : (rawBill.referencePeriod || 'Sem período');

        const billRow = {
            _id: rawBill._id ? String(rawBill._id) : '',
            name: rawBill.name || '',
            dueDate: rawBill.dueDate || null,
            formattedDueDate: formatDateBR(rawBill.dueDate),
            referencePeriod: monthKey,
            status,
            statusLabel,
            paymentType,
            paymentTypeLabel,
            userNames: resolvedUsers.map(u => u.name),
            userCount: resolvedUsers.length,
            isShared: resolvedUsers.length > 1,
            fullValue,
            effectiveValue,
        };

        if (!monthsMap.has(monthKey)) {
            monthsMap.set(monthKey, {
                month: monthKey,
                formattedMonth: formatReferencePeriod(monthKey),
                sortKey: periodDesc ? periodDesc.key : Number.MAX_SAFE_INTEGER,
                bills: [],
                totalValue: 0,
                paidValue: 0,
                unpaidValue: 0,
                paymentMap: new Map(),
            });
        }

        const monthGroup = monthsMap.get(monthKey);
        monthGroup.bills.push(billRow);
        monthGroup.totalValue += numericEffective;
        if (status === 'PAID') {
            monthGroup.paidValue += numericEffective;
        } else {
            monthGroup.unpaidValue += numericEffective;
        }

        if (!monthGroup.paymentMap.has(paymentType)) {
            monthGroup.paymentMap.set(paymentType, { type: paymentType, label: paymentTypeLabel, total: 0, count: 0 });
        }
        const monthPayment = monthGroup.paymentMap.get(paymentType);
        monthPayment.total += numericEffective;
        monthPayment.count += 1;

        // Global totals
        totalBills += 1;
        totalValue += numericEffective;
        if (status === 'PAID') {
            paidValue += numericEffective;
            paidCount += 1;
        } else if (status === 'ERROR') {
            unpaidValue += numericEffective;
            errorCount += 1;
        } else {
            unpaidValue += numericEffective;
            unpaidCount += 1;
        }

        if (!globalPaymentMap.has(paymentType)) {
            globalPaymentMap.set(paymentType, { type: paymentType, label: paymentTypeLabel, total: 0, count: 0 });
        }
        const globalPayment = globalPaymentMap.get(paymentType);
        globalPayment.total += numericEffective;
        globalPayment.count += 1;

        // User split breakdown
        const shareTargets = requestedUserId !== 'ALL'
            ? resolvedUsers.filter(u => u.id === requestedUserId)
            : (resolvedUsers.length > 0 ? resolvedUsers : [{ id: '__unassigned__', name: 'Sem usuário vinculado' }]);

        const perTargetValue = unitShare ?? 0;
        for (const target of shareTargets) {
            if (!userShareMap.has(target.id)) {
                userShareMap.set(target.id, {
                    userId: target.id,
                    userName: target.name,
                    billCount: 0,
                    sharedBillCount: 0,
                    totalShare: 0,
                    paidShare: 0,
                    unpaidShare: 0,
                    paymentMap: new Map(),
                });
            }
            const userAgg = userShareMap.get(target.id);
            userAgg.billCount += 1;
            if (resolvedUsers.length > 1) {
                userAgg.sharedBillCount += 1;
            }
            userAgg.totalShare += perTargetValue;
            if (status === 'PAID') {
                userAgg.paidShare += perTargetValue;
            } else {
                userAgg.unpaidShare += perTargetValue;
            }

            if (!userAgg.paymentMap.has(paymentType)) {
                userAgg.paymentMap.set(paymentType, { type: paymentType, label: paymentTypeLabel, total: 0, count: 0 });
            }
            const userPayment = userAgg.paymentMap.get(paymentType);
            userPayment.total += perTargetValue;
            userPayment.count += 1;
        }
    }

    const months = Array.from(monthsMap.values())
        .sort((a, b) => a.sortKey - b.sortKey || a.month.localeCompare(b.month))
        .map((group) => ({
            month: group.month,
            formattedMonth: group.formattedMonth,
            billCount: group.bills.length,
            totalValue: group.totalValue,
            paidValue: group.paidValue,
            unpaidValue: group.unpaidValue,
            paymentTypeSummaries: Array.from(group.paymentMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
            bills: group.bills.sort((a, b) => a.name.localeCompare(b.name)),
        }));

    const userBreakdown = Array.from(userShareMap.values())
        .map((entry) => ({
            userId: entry.userId,
            userName: entry.userName,
            billCount: entry.billCount,
            sharedBillCount: entry.sharedBillCount,
            totalShare: entry.totalShare,
            paidShare: entry.paidShare,
            unpaidShare: entry.unpaidShare,
            byPaymentType: Array.from(entry.paymentMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
        }))
        .sort((a, b) => b.totalShare - a.totalShare || a.userName.localeCompare(b.userName));

    return {
        filters: normalizedFilters,
        summary: {
            totalBills,
            monthsCount: months.length,
            totalValue,
            paidValue,
            paidCount,
            unpaidValue,
            unpaidCount,
            errorCount,
            byPaymentType: Array.from(globalPaymentMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
        },
        userBreakdown,
        months,
    };
}

function escapeCsvCell(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[;"\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function formatCsvNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return '';
    }
    return Number(value).toFixed(2).replace('.', ',');
}

/**
 * Serializes a report into a UTF-8 BOM CSV string using `;` delimiter for Brazilian spreadsheet compatibility.
 */
export function generateReportCsv(report) {
    const lines = [];

    const headers = [
        'Período',
        'Conta',
        'Vencimento',
        'Forma de Pagamento',
        'Situação',
        'Usuários',
        'Qtd. Usuários',
        'Valor Integral (R$)',
        'Valor Considerado / Rateio (R$)',
    ];
    lines.push(headers.map(escapeCsvCell).join(';'));

    for (const monthGroup of report.months) {
        for (const bill of monthGroup.bills) {
            const row = [
                monthGroup.month,
                bill.name,
                bill.formattedDueDate === '—' ? '' : bill.formattedDueDate,
                bill.paymentTypeLabel,
                bill.statusLabel,
                bill.userNames.length > 0 ? bill.userNames.join(', ') : 'Sem usuário vinculado',
                bill.userCount || 0,
                formatCsvNumber(bill.fullValue),
                formatCsvNumber(bill.effectiveValue),
            ];
            lines.push(row.map(escapeCsvCell).join(';'));
        }
    }

    lines.push('');
    lines.push(['Resumo de Rateio por Usuário'].map(escapeCsvCell).join(';'));
    lines.push([
        'Usuário',
        'Qtd. Contas',
        'Contas Compartilhadas',
        'Pago (R$)',
        'Pendente (R$)',
        'Total Rateado (R$)',
    ].map(escapeCsvCell).join(';'));

    for (const userRow of report.userBreakdown) {
        lines.push([
            userRow.userName,
            userRow.billCount,
            userRow.sharedBillCount,
            formatCsvNumber(userRow.paidShare),
            formatCsvNumber(userRow.unpaidShare),
            formatCsvNumber(userRow.totalShare),
        ].map(escapeCsvCell).join(';'));
    }

    lines.push('');
    lines.push([
        'Total Geral',
        `${report.summary.totalBills} conta(s)`,
        `${report.summary.monthsCount} mês(es)`,
        formatCsvNumber(report.summary.paidValue),
        formatCsvNumber(report.summary.unpaidValue),
        formatCsvNumber(report.summary.totalValue),
    ].map(escapeCsvCell).join(';'));

    return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export default {
    parsePeriodInput,
    formatReferencePeriod,
    formatCurrencyBR,
    formatDateBR,
    buildBillReport,
    generateReportCsv,
};
