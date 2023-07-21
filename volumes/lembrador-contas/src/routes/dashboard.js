const express = require('express')
const router = express.Router()
const template = require('./template')
const db = require("../db")
const emailUtils = require('../util/emailUtils.js');
const cpflEmailParser = require("../util/cpflEmailParser");

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
    db.Bill.find({ }).lean().exec(
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
           
            let currentPeriodData = table.data.filter(data => data.period.month == currentDate.getMonth()+1 
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
            console.log("email", email)
            const message = await emailUtils.getLastMessage(email.address, email.subject);
            if (!message) {
                console.log("No email found", email.address)
                continue
            }

            let info = {};
            if (db.DataTypeEnum[email.dataType] === db.DataTypeEnum.PDF_ATTACHMENT) {
                info = null//getEmailPDFAttachmentData(values);
                if (!info) {
                    console.log("Failed to get info from PDF attachment", email.address)
                    continue
                }
            } else if(db.DataTypeEnum[email.dataType] === db.DataTypeEnum.BODY) {
                info = await cpflEmailParser.getInfoFromHTMLEmail(message);
                if (!info) {
                    console.log("Failed to get info from email", email.address)
                    continue
                }
            }
            console.log("info", info);
            
            let currentPeriodData = { 
                dueDate: info.vencimento, 
                value: info.valor 
            }
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