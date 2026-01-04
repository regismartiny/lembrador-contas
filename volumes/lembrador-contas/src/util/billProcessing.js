import moment from 'moment';
import db from '../db.js';

async function processBills(bills) {
    const periods = getPeriods()

    console.log("Processing bills for periods:", periods)

    //delete previously processed bills of current periods
    db.ActiveBill.deleteMany({dueDate: {
        $gte: new Date(periods[0].year, periods[0].month + 1, 1),
        $lt: new Date(periods[2].year, periods[2].month + 3, 1)
    }}).catch((err) => {
        console.error("Error deleting previous active bills", err)
    })

    let billsSourceTable = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.TABLE)
    let billsSourceEmail = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.EMAIL)
    
    const promises = [findActiveTableBills(billsSourceTable, periods),
                        findActiveEmailBills(billsSourceEmail, periods)]
    const activeBills = await runParallel(promises)
    
    for (const activeBill of activeBills) {
        activeBill.save().catch((err) => {
            console.error(`Error saving activeBill '${activeBill.name}'`, err)
        })
    }
}

function getBillMonth(dueDate) {
    return Number(dueDate?.getMonth()) + 1 + "/" + dueDate?.getFullYear()
}

function getSum(total, num) {
    return total + ((isNaN(num) || num == undefined) ? 0 : num);
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
    console.log("findTableBills for bill", bill.name, "and period", period)

    let bills = []
    let table = await db.Table.findById(bill.valueSourceId).lean()
    if (!table) {
        console.log(`No table found for bill '${bill.name}'`)
        return bills;
    }
            
    let currentPeriodDataIndex = table.data.findIndex(data => filterCurrentPeriodData(data, period))
    
    if (currentPeriodDataIndex < 0) {
        console.log(`No data found for bill '${bill.name}' for period ${period.month + 1}/${period.year}`)
        return bills;
    }

    let currentPeriodData = table.data[currentPeriodDataIndex]
    console.log("currentPeriodData", currentPeriodData)

    if (!currentPeriodData || !currentPeriodData.period || !currentPeriodData.period.month || !currentPeriodData.period.year) {
        console.log(`Invalid data for bill '${bill.name}' for period ${period.month + 1}/${period.year}`)
        return bills;
    }

    let name = getBillName(bill, currentPeriodDataIndex, table.data.length)
    let users = bill.users
    let dueDate = getDateFromPeriod(currentPeriodData.period, bill.dueDay)
    let value = currentPeriodData.value
    let icon = bill.icon
    bills.push(new db.ActiveBill({users, name, dueDate, value, icon}))

    return bills;
}

function getDateFromPeriod(period, dueDay) {
    return new Date(period.year, period.month, dueDay)
}

function getBillName(bill, currentPeriodDataIndex, totalPeriods) {
    let currentPeriod = currentPeriodDataIndex + 1
    if (db.BillTypeEnum[bill.type]==db.BillTypeEnum.PURCHASE) {
       return `${bill.name} (${currentPeriod}/${totalPeriods})`
    } else {
        return bill.name
    }
}

function filterCurrentPeriodData(data, period) {
    return data.period.month == period.month + 1 
           && data.period.year == period.year
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
        let fallbackDueDate = getDateFromPeriod(period, bill.dueDay)
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

export default {
    getBillMonth,
    getSum,
    getPeriods,
    findActiveTableBills,
    findActiveEmailBills,
    processBills
}