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
            res.render('dashboard/dashboard', { template, title: 'Contas do mês', activeBillList: bills, activeBillStatusEnum: db.ActiveBillStatusEnum })
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
           
            let currentPeriodData = table.data.filter(data => data.period.month == currentDate.getMonth() 
                && data.period.year == currentDate.getFullYear())[0]

            if (currentPeriodData) {
                let name = `${bill.name} - ${bill.company}`
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
            const currentPeriodData = await cpflEmailParser.parse(email.address, email.subject)
            console.log("currentPeriodData", currentPeriodData)

            if (currentPeriodData) {
                let name = `${bill.name} - ${bill.company}`
                let dueDate = currentPeriodData.dueDate//new Date(year=currentDate.getFullYear(), monthIndex=currentDate.getMonth(), date=bill.dueDay)
                let value = currentPeriodData.value
                billsOfTheMonth.push(new db.ActiveBill({name, dueDate, value}))
            }
        }
        console.log("findActiveEmailBills finished")
        resolve(billsOfTheMonth)
    })
}

function handleError(error) {
    console.log("Error! " + error.message)
}

module.exports = router