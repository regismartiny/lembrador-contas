import express from 'express';
import template from './template.js';
import db from '../db.js';
import mongoose from 'mongoose';
import billProcessing from '../util/billProcessing.js';

const router = express.Router();

/* GET Dashboard page. */
router.get('/', function (req, res) {
    db.ActiveBill.find().lean().then(
        async function (activeBills) {
            console.log('activeBills', activeBills)

            let usersIds = activeBills.map(bill => bill.users).flat().map(user => user._id.toString())
            usersIds = [...new Set(usersIds)]

            let users = await db.User.find({ _id: { $in: usersIds } }).lean()

            let activeBillData = []

            for (let user of users) {
                activeBillData.push({user})
            }

            console.log("activeBillData", activeBillData);

            const lastUpdate = activeBills.sort((a,b)=>a.updated_at.getTime()-b.updated_at.getTime())[0]?.updated_at;

            res.render('dashboard/dashboard', { template, title: 'Contas do mês', activeBillData, users, lastUpdate, periodFilterEnum: db.PeriodFilterEnum})
        }).catch((err) => {
            handleError(err)
            return err
        })
})

router.get('/dashboard-new', async function (req, res) {
    db.ActiveBill.find().lean().then(
        async function (bills) {
            let currentMonth = new Date().getMonth()
            let activeBillMonths = new Array()
            
            let currentMonthBills = bills.filter(bill => bill.dueDate?.getMonth() == currentMonth)
            activeBillMonths.push(currentMonthBills)

            let activeBillData = []
            
            const lastUpdate = activeBillMonths.flat().sort((a,b)=>a.updated_at.getTime()-b.updated_at.getTime())[0]?.updated_at;
            for (let activeBills of activeBillMonths) {
                if (activeBills.length == 0) continue
                let firstBill = activeBills[0]
                let billsMonth = getBillMonth(firstBill.dueDate)
                const totalValue = activeBills.map(bill => bill.value).reduce(getSum, 0)
                const billList = activeBills.sort((a,b)=>a.name.localeCompare(b.name))
                const activeBillMonthData = { month: billsMonth, billList, totalValue }
                activeBillData.push(activeBillMonthData)
            }
            res.render('dashboard/dashboard-new', { template, title: 'Contas do mês', activeBillData, activeBillStatusEnum: db.ActiveBillStatusEnum, lastUpdate, periodFilterEnum: db.PeriodFilterEnum })
        }).catch((err) => {
            handleError(err)
            return err
        })
})

router.get('/user-bill-list', async function (req, res) {
    let userId = req.query.userId
    let periodFilter = req.query.periodFilter

    if (!userId || userId == 'null') {
        res.render('dashboard/user-bill-list', { template, title: 'Contas do mês', userBillsData: {}, activeBillStatusEnum: db.ActiveBillStatusEnum })
        return
    }

    let mongoUserId = new mongoose.Types.ObjectId(userId)
    console.log('mongoUserId', mongoUserId)
    db.ActiveBill.find({ users: mongoUserId }).lean().then(
        async function (activeBills) {
            console.log('activeBills', activeBills)

            let monthBillsMap = activeBills.reduce((map, bill) => {
                let month = billProcessing.getBillMonth(bill.dueDate)
                if (!map.has(month)) {
                    map.set(month, [])
                }
                map.get(month).push(bill)
                return map
            }, new Map())

            let userBillsData = { user: userId, billListPerMonth: [] }

            for (let [key, value] of monthBillsMap) {

                value.forEach(bill => {
                    bill.value = bill.value / bill.users.length
                });

                const totalValue = value.map(bill => bill.value).reduce(billProcessing.getSum, 0)
                const billListOrderedByBillName = value.sort((a,b)=>a.name.localeCompare(b.name))
                const activeBillMonthData = { month: key, billList: billListOrderedByBillName, totalValue }

                userBillsData.billListPerMonth.push(activeBillMonthData)
            }

  
            //order userBillsData by month - asc
            userBillsData.billListPerMonth.sort((a,b)=> {
                var yearA = a.month.split("/")[1]
                var yearB = b.month.split("/")[1]
                var monthA = a.month.split("/")[0]
                var monthB = b.month.split("/")[0]
                
                return yearA - yearB || monthA - monthB
            })

            if (!periodFilter || periodFilter == 'CURRENT_AND_FUTURE') {

                //show only current month and future bills
                let currentYear = new Date().getFullYear()
                let currentMonth = new Date().getMonth()
        
                userBillsData.billListPerMonth = userBillsData.billListPerMonth.filter(billList => {
                    let month = billList.month.split("/")[0]
                    let year = billList.month.split("/")[1]
                    return (month >= currentMonth && year >= currentYear || year > currentYear)
                })

                renderUserBillListPage(res, userBillsData)
            } else if (periodFilter == 'ALL') {
                renderUserBillListPage(res, userBillsData)
            }
        }).catch((err) => {
            handleError(err)
            return err
        })
})

/* Process bills. */
router.get('/processBills', async function (req, res) {
    const periods = req.query.periods
    db.Bill.find().then(async (bills) => {

        await billProcessing.processBills(bills, periods)

        res.redirect('/dashboard')
    }).catch((err) => {
        handleError(err)
        return err
    })
})

/* Delete processed bills. */
router.get('/deleteProcessed', async function (req, res) {
    await deleteProcessedActiveBills()
    res.redirect('/dashboard')
})

/* Mark bill as PAID. */
router.get('/paybill/:id', function (req, res) {
    let billId = req.params.id
    let status = 'PAID'
    db.ActiveBill.findOneAndUpdate({ _id: billId }, { $set: { status } }, { new: true }).then(function (bill) {
        res.redirect('/dashboard')
    }).catch((err) => {
        handleError(err)
        return err
    });
})

function handleError(error) {
    console.log("Error! " + error.message)
}

function renderUserBillListPage(res, userBillsData) {
    console.log("userBillsData", userBillsData);
    res.render('dashboard/user-bill-list', { template, title: 'Contas do mês', userBillsData, activeBillStatusEnum: db.ActiveBillStatusEnum })
}

async function deleteProcessedActiveBills() {
    return db.ActiveBill.deleteMany({}).lean()
}

export default router