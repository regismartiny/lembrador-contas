import express from 'express';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import template from './template.js';
import db from '../db.js';
import mongoose from 'mongoose';
import billProcessing from '../util/billProcessing.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

/* GET Dashboard page. */
router.get('/', asyncHandler(async function (req, res) {
    const activeBills = await db.ActiveBill.find().lean()
    logger.info('activeBills', activeBills)

    let usersIds = activeBills.map(bill => bill.users).flat().map(user => user._id.toString())
    usersIds = [...new Set(usersIds)]

    const users = await db.User.find({ _id: { $in: usersIds } }).lean()

    const lastUpdate = activeBills.sort((a,b)=>b.updated_at.getTime()-a.updated_at.getTime())[0]?.updated_at;

    const sessionEmail = req.session.email || ''
    const loggedUser = sessionEmail ? users.find(u => u.email === sessionEmail) : null
    const defaultUserId = loggedUser ? loggedUser._id.toString() : (users[0]?._id.toString() || '')

    res.render('dashboard/dashboard', { template, title: 'Contas do mês', users, lastUpdate, periodFilterEnum: db.PeriodFilterEnum, defaultUserId })
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
        ? [{ month: billProcessing.getBillMonth(currentMonthBills[0].dueDate), billList, totalValue, paymentTypeSummaries }]
        : []

    res.render('dashboard/dashboard-new', { template, title: 'Contas do mês', activeBillData, activeBillStatusEnum: db.ActiveBillStatusEnum, paymentTypeEnum: db.PaymentTypeEnum, lastUpdate, periodFilterEnum: db.PeriodFilterEnum })
}));

router.get('/user-bill-list', asyncHandler(async function (req, res) {
    let userId = req.query.userId
    let periodFilter = req.query.periodFilter

    if (!userId || userId == 'null') {
        res.render('dashboard/user-bill-list', { template, title: 'Contas do mês', userBillsData: {}, activeBillStatusEnum: db.ActiveBillStatusEnum, paymentTypeEnum: db.PaymentTypeEnum })
        return
    }

    const mongoUserId = new mongoose.Types.ObjectId(userId)
    const activeBills = await db.ActiveBill.find({ users: mongoUserId }).lean()
    logger.info('activeBills', activeBills)

    const monthBillsMap = activeBills.reduce((map, bill) => {
        let month = billProcessing.getBillMonth(bill.dueDate)
        if (!map.has(month)) map.set(month, [])
        map.get(month).push(bill)
        return map
    }, new Map())

    let userBillsData = { user: userId, billListPerMonth: [] }

    for (let [key, value] of monthBillsMap) {
        value.forEach(bill => {
            bill.value = bill.value / bill.users.length
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

    if (periodFilter == 'ALL') {
        renderUserBillListPage(res, userBillsData)
    } else {
        // Default: CURRENT_AND_FUTURE — show only current month and future bills
        let currentYear = new Date().getFullYear()
        let currentMonth = new Date().getMonth() + 1

        userBillsData.billListPerMonth = userBillsData.billListPerMonth.filter(billList => {
            let month = billList.month.split("/")[0]
            let year = billList.month.split("/")[1]
            return (month >= currentMonth && (year >= currentYear || year > currentYear))
        })

        renderUserBillListPage(res, userBillsData)
    }
}));

/* Process bills. */
router.post('/processBills', requireAdmin, asyncHandler(async function (req, res) {
    const bills = await db.Bill.find()
    await billProcessing.processBills(bills, req.query.periods)
    res.redirect('/dashboard')
}));

/* Delete processed bills. */
router.post('/deleteProcessed', requireAdmin, asyncHandler(async function (req, res) {
    await db.ActiveBill.deleteMany({}).lean()
    res.redirect('/dashboard')
}));

/* Mark bill as PAID. */
router.post('/paybill/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    await db.ActiveBill.findOneAndUpdate({ _id: req.params.id }, { $set: { status: 'PAID' } }, { new: true })
    res.redirect('/dashboard')
}));

function renderUserBillListPage(res, userBillsData) {
    logger.info("userBillsData", userBillsData);
    res.render('dashboard/user-bill-list', { template, title: 'Contas do mês', userBillsData, activeBillStatusEnum: db.ActiveBillStatusEnum, paymentTypeEnum: db.PaymentTypeEnum })
}

export default router
