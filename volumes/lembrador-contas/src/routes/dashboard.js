import express from 'express';
import logger from '../util/logger.js';
import template from './template.js';
import db from '../db.js';
import mongoose from 'mongoose';
import billProcessing from '../util/billProcessing.js';

const router = express.Router();

/* GET Dashboard page. */
router.get('/', async function (req, res, next) {
    try {
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
    } catch (err) {
        next(err)
    }
})

router.get('/dashboard-new', async function (req, res, next) {
    try {
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
    } catch (err) {
        next(err)
    }
})

router.get('/user-bill-list', async function (req, res, next) {
    let userId = req.query.userId
    let periodFilter = req.query.periodFilter

    if (!userId || userId == 'null') {
        res.render('dashboard/user-bill-list', { template, title: 'Contas do mês', userBillsData: {}, activeBillStatusEnum: db.ActiveBillStatusEnum, paymentTypeEnum: db.PaymentTypeEnum })
        return
    }

    try {
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
            var yearA = a.month.split("/")[1]
            var yearB = b.month.split("/")[1]
            var monthA = a.month.split("/")[0]
            var monthB = b.month.split("/")[0]
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
    } catch (err) {
        next(err)
    }
})

/* Process bills. */
router.get('/processBills', async function (req, res, next) {
    try {
        const bills = await db.Bill.find()
        await billProcessing.processBills(bills, req.query.periods)
        res.redirect('/dashboard')
    } catch (err) {
        next(err)
    }
})

/* Delete processed bills. */
router.get('/deleteProcessed', async function (req, res, next) {
    try {
        await db.ActiveBill.deleteMany({}).lean()
        res.redirect('/dashboard')
    } catch (err) {
        next(err)
    }
})

/* Mark bill as PAID. */
router.get('/paybill/:id', async function (req, res, next) {
    try {
        await db.ActiveBill.findOneAndUpdate({ _id: req.params.id }, { $set: { status: 'PAID' } }, { new: true })
        res.redirect('/dashboard')
    } catch (err) {
        next(err)
    }
})

function renderUserBillListPage(res, userBillsData) {
    logger.info("userBillsData", userBillsData);
    res.render('dashboard/user-bill-list', { template, title: 'Contas do mês', userBillsData, activeBillStatusEnum: db.ActiveBillStatusEnum, paymentTypeEnum: db.PaymentTypeEnum })
}

export default router
