import express from 'express';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import template from './template.js';
import db from '../db.js';
import mongoose from 'mongoose';
import billProcessing from '../util/billProcessing.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';
import { validateBody } from '../middleware/validate.js';

const router = express.Router();

function parseBillValue(raw) {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return { valid: true, value: undefined };
    }
    const str = String(raw).trim();
    const normalized = str.includes(',') ? str.replace(/\./g, '').replace(',', '.') : str;
    const num = Number(normalized);
    if (!Number.isFinite(num)) {
        return { valid: false, value: undefined };
    }
    return { valid: true, value: num };
}

/* GET Dashboard page. */
router.get('/', asyncHandler(async function (req, res) {
    const [activeBills, allUsers] = await Promise.all([
        db.ActiveBill.find().lean(),
        db.User.find({}).lean(),
    ])
    logger.debug({ activeBillCount: activeBills.length }, 'Loaded dashboard bills')

    const billUserIds = new Set(
        activeBills
            .flatMap(bill => bill.users || [])
            .filter(Boolean)
            .map(user => (user._id || user).toString())
    )

    const users = allUsers
        .filter(user => !user.status || user.status === 'ACTIVE' || billUserIds.has(user._id.toString()))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    const lastUpdate = activeBills.sort((a,b)=>(b.updated_at?.getTime?.() || 0)-(a.updated_at?.getTime?.() || 0))[0]?.updated_at;

    const sessionEmail = req.session.email || ''
    const loggedUser = sessionEmail ? users.find(u => u.email === sessionEmail) : null
    const defaultUserId = loggedUser ? loggedUser._id.toString() : (users[0]?._id.toString() || '')
    const authDisabled = !process.env.APP_PASSWORD

    res.render('dashboard/dashboard', { template, title: 'Demonstrativo mensal', users, lastUpdate, periodFilterEnum: db.PeriodFilterEnum, defaultUserId, authDisabled })
}));

router.get('/dashboard-new', asyncHandler(async function (req, res) {
    const bills = await db.ActiveBill.find().lean()
    let currentMonth = new Date().getMonth()
    let currentMonthBills = bills.filter(bill => bill.dueDate?.getMonth() == currentMonth)

    const lastUpdate = currentMonthBills.sort((a,b)=>b.updated_at.getTime()-a.updated_at.getTime())[0]?.updated_at;

    const totalValue = currentMonthBills.map(bill => bill.value).reduce(billProcessing.getSum, 0)
    const billList = currentMonthBills.sort((a,b)=>a.name.localeCompare(b.name))
    const paymentTypeSummaries = billProcessing.groupByPaymentType(currentMonthBills)

    const activeBillData = currentMonthBills.length > 0
        ? [{ month: currentMonthBills[0].referencePeriod, billList, totalValue, paymentTypeSummaries }]
        : []

    res.render('dashboard/dashboard-new', { template, title: 'Demonstrativo mensal', activeBillData, activeBillStatusEnum: db.ActiveBillStatusEnum, paymentTypeEnum: db.PaymentTypeEnum, lastUpdate, periodFilterEnum: db.PeriodFilterEnum })
}));

router.get('/user-bill-list', asyncHandler(async function (req, res) {
    let userId = req.query.userId
    let periodFilter = req.query.periodFilter
    const sessionEmail = req.session?.email || ''
    const currentUser = sessionEmail ? await db.User.findOne({ email: sessionEmail }).lean() : null
    const isAdmin = !!currentUser?.admin

    if (!userId || userId == 'null') {
        const allUsers = await db.User.find({}).lean()
        const hasActiveUsers = allUsers.some(u => !u.status || u.status === 'ACTIVE')
        renderUserBillListPage(
            res,
            {},
            isAdmin,
            { reason: hasActiveUsers ? 'no_user_selected' : 'no_users' }
        )
        return
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        renderUserBillListPage(res, { user: userId, billListPerMonth: [] }, isAdmin, { reason: 'invalid_user' })
        return
    }

    const mongoUserId = new mongoose.Types.ObjectId(userId)
    const activeBills = await db.ActiveBill.find({ users: mongoUserId }).lean()
    logger.debug({ activeBillCount: activeBills.length }, 'Loaded user dashboard bills')

    const monthBillsMap = activeBills.reduce((map, bill) => {
        let month = bill.referencePeriod
        if (!map.has(month)) map.set(month, [])
        map.get(month).push(bill)
        return map
    }, new Map())

    let userBillsData = { user: userId, billListPerMonth: [] }

    for (let [key, value] of monthBillsMap) {
        value.forEach(bill => {
            const n = bill.users.length || 1
            bill.value = bill.value / n
        });

        const paymentTypeSummaries = billProcessing.groupByPaymentType(value)

        const totalValue = value.map(bill => bill.value).reduce(billProcessing.getSum, 0)
        const billListOrderedByBillName = value.sort((a,b)=>a.name.localeCompare(b.name))
        userBillsData.billListPerMonth.push({ month: key, billList: billListOrderedByBillName, totalValue, paymentTypeSummaries })
    }

    userBillsData.billListPerMonth.sort((a,b)=> {
        const yearA = a.month.split("/")[1]
        const yearB = b.month.split("/")[1]
        const monthA = a.month.split("/")[0]
        const monthB = b.month.split("/")[0]
        return yearA - yearB || monthA - monthB
    })

    if (periodFilter == 'LAST_3_MONTHS' || periodFilter == 'LAST_6_MONTHS') {
        const currentDate = new Date()
        const currentPeriod = currentDate.getFullYear() * 12 + currentDate.getMonth()
        const monthsToShow = periodFilter == 'LAST_3_MONTHS' ? 3 : 6

        userBillsData.billListPerMonth = userBillsData.billListPerMonth.filter(billList => {
            const [month, year] = billList.month.split('/').map(Number)
            const billPeriod = year * 12 + month - 1
            return billPeriod >= currentPeriod - monthsToShow + 1 && billPeriod <= currentPeriod
        })
    } else if (periodFilter == 'CURRENT_YEAR') {
        const currentYear = new Date().getFullYear()
        userBillsData.billListPerMonth = userBillsData.billListPerMonth.filter(billList => {
            const year = Number(billList.month.split('/')[1])
            return year === currentYear
        })
    } else if (periodFilter != 'ALL') {
        // Default: CURRENT_AND_FUTURE — show only previous month and future bills
        let prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
        let activeYear = prev.getFullYear();
        let activeMonth = prev.getMonth() + 1;

        userBillsData.billListPerMonth = userBillsData.billListPerMonth.filter(billList => {
            let month = Number(billList.month.split("/")[0])
            let year = Number(billList.month.split("/")[1])
            return year > activeYear || (year === activeYear && month >= activeMonth)
        })
    }

    let emptyState = null
    if (userBillsData.billListPerMonth.length === 0) {
        if (activeBills.length > 0) {
            emptyState = { reason: 'filtered_out', totalUserActiveBills: activeBills.length }
        } else {
            const allBills = await db.Bill.find({}).lean()
            const activeConfiguredBills = allBills.filter(b => !b.status || b.status === 'ACTIVE')
            const userConfiguredBills = activeConfiguredBills.filter(b =>
                (b.users || []).some(u => (u._id || u).toString() === userId)
            )
            if (activeConfiguredBills.length === 0) {
                emptyState = { reason: 'no_bills_configured' }
            } else if (userConfiguredBills.length === 0) {
                emptyState = { reason: 'no_bills_for_user', configuredBillsCount: activeConfiguredBills.length }
            } else {
                emptyState = { reason: 'awaiting_processing', userConfiguredBillsCount: userConfiguredBills.length }
            }
        }
    }

    renderUserBillListPage(res, userBillsData, isAdmin, emptyState)
}));

/* Process bills. */
router.post('/processBills', requireAdmin, asyncHandler(async function (req, res) {
    const bills = await db.Bill.find()
    const result = await billProcessing.processBills(bills, req.query.periods)
    if (result?.skipped) {
        return res.status(409).json({ error: 'Processamento já em andamento.' })
    }
    res.json({ success: true })
}));

/* GET New ActiveBill page. */
router.get('/active-bills/new', requireAdmin, asyncHandler(async function (req, res) {
    const activeUsers = await db.User.find({ status: 'ACTIVE' }).lean()
    const now = new Date()
    const defaultReferencePeriod = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`

    res.render('dashboard/active-bill-edit', {
        template,
        title: 'Nova linha de conta ativa',
        activeBill: {
            users: [],
            name: '',
            dueDate: '',
            value: '',
            icon: '',
            status: 'UNPAID',
            paymentType: 'PIX',
            referencePeriod: defaultReferencePeriod,
        },
        activeUsers,
        activeBillStatusEnum: db.ActiveBillStatusEnum,
        paymentTypeEnum: db.PaymentTypeEnum,
        isNew: true,
    })
}));

/* POST Add ActiveBill. */
router.post('/active-bills/add', requireAdmin, validateBody({
    name: { required: true, trim: true, message: 'Nome é obrigatório.' },
}), asyncHandler(async function (req, res) {
    const { name, dueDate, value, status, paymentType, referencePeriod, icon } = req.body
    const parsedValue = parseBillValue(value)
    if (!parsedValue.valid) {
        return res.status(400).json({ error: 'Valor inválido.' })
    }
    const users = Array.isArray(req.body.users) ? req.body.users : req.body.users ? [req.body.users] : []
    const now = new Date()
    const defaultReferencePeriod = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`

    const activeBill = new db.ActiveBill({
        users,
        name,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        value: parsedValue.value,
        icon,
        status: status || 'UNPAID',
        paymentType: paymentType || 'PIX',
        referencePeriod: referencePeriod || defaultReferencePeriod,
    })
    await activeBill.save()

    res.redirect('/dashboard')
}));

/* GET ActiveBill edit page. */
router.get('/active-bills/edit/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    const [activeBill, activeUsers] = await Promise.all([
        db.ActiveBill.findById(req.params.id).lean(),
        db.User.find({ status: 'ACTIVE' }).lean()
    ])

    if (!activeBill) {
        return res.status(404).render('error', { message: 'Conta ativa não encontrada.' })
    }

    res.render('dashboard/active-bill-edit', {
        template,
        title: 'Edição de conta',
        activeBill,
        activeUsers,
        activeBillStatusEnum: db.ActiveBillStatusEnum,
        paymentTypeEnum: db.PaymentTypeEnum,
        isNew: false,
    })
}));

/* POST update ActiveBill. */
router.post('/active-bills/update', requireAdmin, validateBody({
    id: { required: true, message: 'ID é obrigatório.' },
    name: { required: true, trim: true, message: 'Nome é obrigatório.' },
}), validateObjectId('id'), asyncHandler(async function (req, res) {
    const { id, name, dueDate, value, status, paymentType, referencePeriod, icon } = req.body
    const parsedValue = parseBillValue(value)
    if (!parsedValue.valid) {
        return res.status(400).json({ error: 'Valor inválido.' })
    }
    const users = Array.isArray(req.body.users) ? req.body.users : req.body.users ? [req.body.users] : []

    await db.ActiveBill.findOneAndUpdate(
        { _id: id },
        { $set: {
            users,
            name,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            value: parsedValue.value,
            icon,
            status,
            paymentType,
            referencePeriod,
            updated_at: new Date(),
        } },
        { new: true }
    )

    res.redirect('/dashboard')
}));

/* POST Remove ActiveBill. */
router.post('/active-bills/remove/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    await db.ActiveBill.findOneAndDelete({ _id: req.params.id })
    res.redirect('/dashboard')
}));

/* Delete processed bills. */
router.post('/deleteProcessed', requireAdmin, asyncHandler(async function (req, res) {
    let periods = []
    if (req.query.periods) {
        try {
            periods = JSON.parse(req.query.periods)
        } catch {
            return res.status(400).json({ error: 'Parâmetro periods inválido.' })
        }
        if (!Array.isArray(periods)) {
            return res.status(400).json({ error: 'Parâmetro periods deve ser um array.' })
        }
    }
    const referencePeriods = periods.map(p => String(p.month + 1).padStart(2, '0') + '/' + p.year)
    if (referencePeriods.length > 0) {
        await db.ActiveBill.deleteMany({ referencePeriod: { $in: referencePeriods } })
    }
    res.redirect('/dashboard')
}));

/* Mark bill as PAID. */
router.post('/paybill/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    await db.ActiveBill.findOneAndUpdate({ _id: req.params.id }, { $set: { status: 'PAID' } }, { new: true })
    res.redirect('/dashboard')
}));

function renderUserBillListPage(res, userBillsData, isAdmin = false, emptyState = null) {
    let prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    logger.debug({ periodCount: userBillsData.billListPerMonth?.length || 0 }, 'Rendering user bill list')
    res.render('dashboard/user-bill-list', {
        template,
        title: 'Demonstrativo mensal',
        userBillsData,
        activeBillStatusEnum: db.ActiveBillStatusEnum,
        paymentTypeEnum: db.PaymentTypeEnum,
        currentMonth: prev.getMonth() + 1,
        currentYear: prev.getFullYear(),
        isAdmin,
        emptyState,
    })
}

export default router
