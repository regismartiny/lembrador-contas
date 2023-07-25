const express = require('express')
const router = express.Router()
const template = require('./template')
const db = require("../db")
const cpflEmailParser = require("../parser/cpflEmailParser");

/* GET Dashboard page. */
router.get('/', function (req, res) {
    db.ActiveBill.find().lean().exec(
        function (err, bills) {
            if (err) {
                handleError(err)
                return err
            }
            const lastUpdate = bills.sort((a,b)=>a.updated_at.getTime()-b.updated_at.getTime())[0].updated_at;
            const totalValue = bills.map(bill => bill.value).reduce(getSum, 0)
            let billList = bills.sort((a,b)=>a.name.localeCompare(b.name))
            const activeBillData = { billList, totalValue, lastUpdate }
            res.render('dashboard/dashboard', { template, title: 'Contas do mês', activeBillData, activeBillStatusEnum: db.ActiveBillStatusEnum })
        })
})

/* Process current month bills. */
router.get('/processBills', async function (req, res) {
    await deleteProcessedActiveBills()
    db.Bill.find().lean().exec(
        async function (err, bills) {
            if (err) {
                handleError(err)
                return err
            }
            console.log("bills", bills)
            let billsOfTheMonth = []

            let billsSourceTable = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.TABLE)
            let billsSourceEmail = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.EMAIL)
            
            const promises = [findActiveTableBills(billsSourceTable),
                              findActiveEmailBills(billsSourceEmail)]
            for (const promise of promises) {
                let result = await promise
                billsOfTheMonth = billsOfTheMonth.concat(result)
            }

            console.log("activeBills", billsOfTheMonth)
            
            for (const activeBill of billsOfTheMonth) {
                activeBill.save(function (err) {
                    if (err) {
                        console.error(`Error saving activeBill '${activeBill.name}'`, err)
                    }
                });
            }

            res.redirect('/dashboard')
        })
})

/* Deleted processed bills. */
router.get('/deleteProcess', function (req, res) {
    deleteProcessedActiveBills()
    res.redirect('/dashboard')
})

/* Mark bill as PAID. */
router.get('/paybill/:id', function (req, res) {
    let billId = req.params.id;
    let status = 'PAID'
    db.ActiveBill.findOneAndUpdate({ _id: billId }, { $set: { status } }, { new: true }, function (err, bill) {
        if (err) {
            handleError(err)
            return err
        }
        res.redirect('/dashboard')
    })
})

/********************************************************************************* */

function getSum(total, num) {
    return total + (isNaN(num) ? 0 : num);
}

async function deleteProcessedActiveBills() {
    await db.ActiveBill.deleteMany({}).lean().exec()
}

function findActiveTableBills(billsSourceTable) {
    console.log("findActiveTableBills started")
    return new Promise(async function (resolve, reject) {
        let billsOfTheMonth = []
        let currentDate = new Date()
        for (const bill of billsSourceTable) {
            let table = await db.Table.findById(bill.valueSourceId).lean().exec()
           
            let currentPeriodData = table.data.filter(
                data => data.period.month == currentDate.getMonth()+1 
                        && data.period.year == currentDate.getFullYear())[0]

            if (currentPeriodData) {
                let name = bill.name
                let dueDate = new Date(year=currentPeriodData.period.year, monthIndex=currentPeriodData.period.month, date=bill.dueDay)
                let value = currentPeriodData.value
                billsOfTheMonth.push(new db.ActiveBill({name, dueDate, value}))
            }
        }
        console.log("findActiveTableBills finished")
        resolve(billsOfTheMonth)
    })
}

function findActiveEmailBills(billsSourceEmail) {
    console.log("findActiveEmailBills started")
    return new Promise(async function (resolve, reject) {
        let billsOfTheMonth = []
        let currentDate = new Date()
        for (const bill of billsSourceEmail) {
            let email = await db.Email.findById(bill.valueSourceId).lean().exec()

            const parsedData = await parseEmailData(email)

            let name = bill.name
            let dueDate = parsedData?.dueDate
            let value = parsedData?.value
            let status = dueDate && value ? 'UNPAID' : 'ERROR'
            billsOfTheMonth.push(new db.ActiveBill({name, dueDate, value, status}))
        }
        console.log("findActiveEmailBills finished")
        resolve(billsOfTheMonth)
    })
}

async function parseEmailData(email) {
    try {
        const parser = require(`../parser/${db.DataParserEnum[email.dataParser]}`);
        let parsedData = await parser.fetch(email.address, email.subject)
        console.log("parsedData", parsedData)
        return parsedData
    } catch(error) {
        console.error("Error parsing data", error)
        return {}
    }
}

function handleError(error) {
    console.log("Error! " + error.message)
}

module.exports = router