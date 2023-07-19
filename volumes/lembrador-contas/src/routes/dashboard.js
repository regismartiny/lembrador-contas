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
            res.render('dashboard/dashboard', { template, title: 'Contas do mês', activeBillList: bills })
        })
})

router.get('/processBills', function (req, res) {

    db.Bill.find().lean().exec(
        async function (err, bills) {
            if (err) {
                handleError(err)
                return err
            }
            let billsSourceTable = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.TABLE)
            // let idsSourceEmail = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.EMAIL)
            //     .map(bill => bill._id)

            let billsOfTheMonth = await findActiveTableBills(billsSourceTable);

            console.log("ActiveBills found:")
            console.log(billsOfTheMonth)
    
            billsOfTheMonth.forEach(activeBill => {
                activeBill.save(function (err) {
                    if (err) {
                        handleError(err)
                        return err;
                    }
                    console.log("ActiveBill saved");
                });
            })
        })

    res.redirect('/dashboard')
})

router.get('/deleteProcess', function (req, res) {
    db.ActiveBill.deleteMany({}).lean().exec()
    res.redirect('/dashboard')
})

function findActiveTableBills(billsSourceTable) {
    return new Promise(function (resolve, reject) {
        let billsOfTheMonth = []
        let currentDate = new Date();
        billsSourceTable.forEach(async function(bill, idx, array) {
            let table = await db.Table.findById(bill.valueSourceId).lean().exec()
            let currentPeriodData = table.data.filter(data => data.period.month == currentDate.getMonth()+1 
                && data.period.year == currentDate.getFullYear())[0]
            if (currentPeriodData) {
                let name = `${bill.company} - ${table.name}`
                let dueDate = new Date(year=currentDate.getFullYear(), monthIndex=currentDate.getMonth(), date=currentDate.getDay())
                let value = currentPeriodData.value
                billsOfTheMonth.push(new db.ActiveBill({name, dueDate, value}))
            }
            if (idx === array.length - 1){ 
                resolve(billsOfTheMonth);
            }
        });
    })
}

function handleError(error) {
    console.log("Error! " + error.message)
}

module.exports = router