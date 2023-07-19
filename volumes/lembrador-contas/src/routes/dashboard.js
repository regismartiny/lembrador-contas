var express = require('express')
var router = express.Router()
var template = require('./template')
var db = require("../db")

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

router.get('/processBills', async function (req, res) {
    await deleteProcessedActiveBills()
    db.Bill.find({ }).lean().exec(
        async function (err, bills) {
            if (err) {
                handleError(err)
                return err
            }
            console.log(bills)
            let billsOfTheMonth = []

            let billsSourceTable = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.TABLE)
            let tableBills = await findActiveTableBills(billsSourceTable)
            billsOfTheMonth = billsOfTheMonth.concat(tableBills)

            let billsSourceEmail = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.EMAIL)
            let emailBills = await findActiveEmailBills(billsSourceEmail)
            billsOfTheMonth = billsOfTheMonth.concat(emailBills)

            console.log("ActiveBills found:")
            console.log(billsOfTheMonth)
    
            billsOfTheMonth.forEach(activeBill => {
                activeBill.save(function (err) {
                    if (err) {
                        handleError(err)
                        return err;
                    }
                    console.log("ActiveBill saved")
                });
            })
        })

    res.redirect('/dashboard')
})

router.get('/deleteProcess', function (req, res) {
    deleteProcessedActiveBills()
    res.redirect('/dashboard')
})

/********************************************************************************* */

async function deleteProcessedActiveBills() {
    await db.ActiveBill.deleteMany({}).lean().exec()
}

function findActiveTableBills(billsSourceTable) {
    return new Promise(function (resolve, reject) {
        let billsOfTheMonth = []
        let currentDate = new Date()
        billsSourceTable.forEach(async function(bill, idx, array) {
            let table = await db.Table.findById(bill.valueSourceId).lean().exec()
           
            let currentPeriodData = table.data.filter(data => data.period.month == currentDate.getMonth()+1 
                && data.period.year == currentDate.getFullYear())[0]

            if (currentPeriodData) {
                let name = `${bill.name} - ${bill.company}`
                let dueDate = new Date(year=currentDate.getFullYear(), monthIndex=currentDate.getMonth(), date=bill.dueDay)
                let value = currentPeriodData.value
                billsOfTheMonth.push(new db.ActiveBill({name, dueDate, value}))
            }
            if (idx === array.length - 1){ 
                resolve(billsOfTheMonth)
            }
        });
    })
}

function findActiveEmailBills(billsSourceEmail) {
    return new Promise(function (resolve, reject) {
        let billsOfTheMonth = []
        let currentDate = new Date()
        billsSourceEmail.forEach(async function(bill, idx, array) {
            let email = await db.Email.findById(bill.valueSourceId).lean().exec()
            
            let currentPeriodData = { value: 100}

            if (currentPeriodData) {
                let name = `${bill.name} - ${bill.company}`
                let dueDate = new Date(year=currentDate.getFullYear(), monthIndex=currentDate.getMonth(), date=bill.dueDay)
                let value = currentPeriodData.value
                billsOfTheMonth.push(new db.ActiveBill({name, dueDate, value}))
            }
            if (idx === array.length - 1){ 
                resolve(billsOfTheMonth)
            }
        });
    })
}

function handleError(error) {
    console.log("Error! " + error.message)
}

module.exports = router