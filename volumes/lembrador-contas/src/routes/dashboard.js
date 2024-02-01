const express = require('express')
const router = express.Router()
const template = require('./template')
const db = require("../db")
const moment = require('moment')

/* GET Dashboard page. */
router.get('/', async function (req, res) {
    try {
        let bills = await db.ActiveBill.find().lean().exec()
        let currentMonth = new Date().getMonth()
        let activeBillMonths = new Array()
        
        let currentMonthBills = bills.filter(bill => bill.dueDate?.getMonth() == currentMonth)
        activeBillMonths.push(currentMonthBills)

        let activeBillData = []
        
        const lastUpdate = activeBillMonths.flat().sort((a,b)=>a.updated_at.getTime()-b.updated_at.getTime())[0]?.updated_at
        for (let activeBills of activeBillMonths) {
            if (activeBills.length == 0) continue
            let firstBill = activeBills[0]
            let billsMonth = getBillMonth(firstBill.dueDate)
            const totalValue = activeBills.map(bill => bill.value).reduce(getSum, 0)
            const billList = activeBills.sort((a,b)=>a.name.localeCompare(b.name))
            const activeBillMonthData = { month: billsMonth, billList, totalValue }
            activeBillData.push(activeBillMonthData)
        }
        res.render('dashboard/dashboard', { template, title: 'Contas do mês', activeBillData, activeBillStatusEnum: db.ActiveBillStatusEnum, lastUpdate })
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* Process current month bills. */
router.get('/processBills', async function (req, res) {
    try {
        await deleteProcessedActiveBills()
        let bills = await db.Bill.find().lean().exec()
        console.log("bills", bills)

        let billsSourceTable = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.TABLE)
        let billsSourceEmail = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.EMAIL)
        
        const periods = getPeriods()
        const promises = [findActiveTableBills(billsSourceTable, periods),
                            findActiveEmailBills(billsSourceEmail, periods)]
        const activeBills = await runParallel(promises)

        console.log("activeBills", activeBills)
        
        for (const activeBill of activeBills) {
            activeBill.save()
            .then(function (models) {
                console.log(models);
            })
            .catch(function (err) {
                console.error(`Error saving activeBill '${activeBill.name}'`, err)
            })
        }

        res.redirect('/dashboard')
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* Deleted processed bills. */
router.get('/deleteProcess', function (req, res) {
    deleteProcessedActiveBills()
    res.redirect('/dashboard')
})

/* Mark bill as PAID. */
router.get('/paybill/:id', async function (req, res) {
    let billId = req.params.id
    let status = 'PAID'

    try {
        await db.ActiveBill.findOneAndUpdate({ _id: billId }, { $set: { status } }, { new: true })
    } catch(err) {
        handleError(err, res)
        res.redirect('/dashboard')
    }
})

/********************************************************************************* */

function getBillMonth(dueDate) {
    return Number(dueDate?.getMonth()) + 1 + "/" + dueDate?.getFullYear()
}

function getSum(total, num) {
    return total + ((isNaN(num) || num == undefined) ? 0 : num)
}

async function deleteProcessedActiveBills() {
    await db.ActiveBill.deleteMany({}).lean().exec()
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
    let table = await db.Table.findById(bill.valueSourceId).lean().exec()
            
    let currentPeriodData = table.data.filter(
        data => data.period.month == period.month + 1 
                && data.period.year == period.year)[0]

    if (currentPeriodData) {
        let name = bill.name
        let dueDate = new Date(year=currentPeriodData.period.year, monthIndex=currentPeriodData.period.month, date=bill.dueDay)
        let value = currentPeriodData.value
        bills.push(new db.ActiveBill({name, dueDate, value}))
    }

    return bills
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
    let email = await db.Email.findById(bill.valueSourceId).lean().exec()
    const parsedDataList = await parseEmailData(email, period)

    for (const parsedData of parsedDataList) {
        console.log("parsedData", parsedData)
        let fallbackDueDate = new Date(period.year, period.month, bill.dueDay)
        let name = bill.name
        let dueDate = parsedData.dueDate ? parsedData.dueDate : fallbackDueDate
        let value = parsedData?.value
        let status = dueDate && value ? 'UNPAID' : 'ERROR'
        bills.push(new db.ActiveBill({name, dueDate, value, status}))
    }
    return bills
}

async function parseEmailData(email, period) {
    try {
        const parser = require(`../parser/${db.DataParserEnum[email.dataParser]}`)
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

function handleError(error, res) {
    console.log("Error! " + error.message)
    res.render('error', { message: '', error: error})
  }

module.exports = router