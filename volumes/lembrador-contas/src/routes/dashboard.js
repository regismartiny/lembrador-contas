const express = require('express')
const router = express.Router()
const template = require('./template')
const db = require("../db")
const moment = require('moment');
var mongoose = require('mongoose')

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

            res.render('dashboard/dashboard', { template, title: 'Contas do mês', activeBillData, lastUpdate })
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
            res.render('dashboard/dashboard-new', { template, title: 'Contas do mês', activeBillData, activeBillStatusEnum: db.ActiveBillStatusEnum, lastUpdate })
        }).catch((err) => {
            handleError(err)
            return err
        })
})

router.get('/user-bill-list', async function (req, res) {
    let userId = req.query.userId
    let mongoUserId = !userId ? mongoUserId = new mongoose.Types.ObjectId(userId) : null
    console.log('userId', userId)
    db.ActiveBill.find({ users: mongoUserId }).lean().then(
        async function (activeBills) {
            console.log('activeBills', activeBills)

            let monthBillsMap = activeBills.reduce((map, bill) => {
                let month = getBillMonth(bill.dueDate)
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

                const totalValue = value.map(bill => bill.value).reduce(getSum, 0)
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

            //show only current month and future bills
            let currentYear = new Date().getFullYear()
            let currentMonth = new Date().getMonth()
      
            userBillsData.billListPerMonth = userBillsData.billListPerMonth.filter(billList => {
                let month = billList.month.split("/")[0]
                let year = billList.month.split("/")[1]
                return (month >= currentMonth && year >= currentYear || year > currentYear)
            })

            console.log("userBillsData", userBillsData);

            res.render('dashboard/user-bill-list', { template, title: 'Contas do mês', userBillsData, activeBillStatusEnum: db.ActiveBillStatusEnum })
        }).catch((err) => {
            handleError(err)
            return err
        })
})

/* Process current month bills. */
router.get('/processBills', async function (req, res) {
    await deleteProcessedActiveBills()
    db.Bill.find().then(async (bills) => {

        let billsSourceTable = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.TABLE)
        let billsSourceEmail = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.EMAIL)
        
        const periods = getPeriods()
        const promises = [findActiveTableBills(billsSourceTable, periods),
                            findActiveEmailBills(billsSourceEmail, periods)]
        const activeBills = await runParallel(promises)
        
        for (const activeBill of activeBills) {
            activeBill.save(function (err) {
                if (err) {
                    console.error(`Error saving activeBill '${activeBill.name}'`, err)
                }
            })
        }

        res.redirect('/dashboard')
    }).catch((err) => {
        handleError(err)
        return err
    })
})

/* Deleted processed bills. */
router.get('/deleteProcess', function (req, res) {
    deleteProcessedActiveBills()
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

/********************************************************************************* */

function getBillMonth(dueDate) {
    return Number(dueDate?.getMonth()) + 1 + "/" + dueDate?.getFullYear()
}

function getSum(total, num) {
    return total + ((isNaN(num) || num == undefined) ? 0 : num);
}

async function deleteProcessedActiveBills() {
    await db.ActiveBill.deleteMany({}).lean()
}

function getPeriods() {
    let currentDate = new Date()
    let previousMonthDate = moment(currentDate).subtract(1, 'M').toDate()
    let nextMonthDate = moment(currentDate).add(1, 'M').toDate()
    return [ { month: previousMonthDate.getMonth(), year: previousMonthDate.getFullYear() }, 
            { month: currentDate.getMonth(), year: currentDate.getFullYear()},
            { month: nextMonthDate.getMonth(), year: nextMonthDate.getFullYear() }]
}

function findActiveTableBills(billsSourceTable, periods) {
    console.log("findActiveTableBills started")
    const promises = []
    for (const period of periods) {
        for (const bill of billsSourceTable) {
            promises.push(findTableBills(bill, period))
        }
    }
    const bills = runParallel(promises)
    console.log("findActiveTableBills finished")
    return bills
}

async function findTableBills(bill, period) {
    let bills = []
    let table = await db.Table.findById(bill.valueSourceId).lean()
            
    let currentPeriodData = table.data.filter(
        data => data.period.month == period.month + 1 
                && data.period.year == period.year)[0]

    if (currentPeriodData) {
        let users = bill.users
        let name = bill.name
        let dueDate = new Date(year=currentPeriodData.period.year, monthIndex=currentPeriodData.period.month, date=bill.dueDay)
        let value = currentPeriodData.value
        let icon = bill.icon
        bills.push(new db.ActiveBill({users, name, dueDate, value, icon}))
    }

    return bills;
}

async function findActiveEmailBills(billsSourceEmail, periods) {
    console.log("findActiveEmailBills started")
    const promises = []
    for (const period of periods) {
        for (const bill of billsSourceEmail) {
            promises.push(findEmailBills(bill, period))
        }
    }
    const bills = await runParallel(promises)
    console.log("findActiveEmailBills finished")
    return bills
}

async function findEmailBills(bill, period) {
    let bills = []
    let email = await db.Email.findById(bill.valueSourceId).lean()
    const parsedDataList = await parseEmailData(email, period)

    for (const parsedData of parsedDataList) {
        let users = bill.users
        let fallbackDueDate = new Date(period.year, period.month, bill.dueDay)
        let name = bill.name
        let dueDate = parsedData.dueDate ? parsedData.dueDate : fallbackDueDate
        let value = parsedData?.value
        let icon = bill.icon
        let status = dueDate && value ? 'UNPAID' : 'ERROR'
        bills.push(new db.ActiveBill({users, name, dueDate, value, icon, status}))
    }
    return bills;
}

async function parseEmailData(email, period) {
    try {
        const parser = require(`../parser/${db.DataParserEnum[email.dataParser]}`);
        let parsedData = await parser.fetch(email.address, email.subject, period)
        return parsedData
    } catch(error) {
        console.error("Error parsing data", error)
        return []
    }
}

async function runParallel(promises) {
    let results = []
    for (const promise of promises) {
        let result = await promise
        results = results.concat(result)
    }
    return results
}

function handleError(error) {
    console.log("Error! " + error.message)
}

module.exports = router