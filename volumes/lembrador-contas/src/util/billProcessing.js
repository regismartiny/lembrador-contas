import moment from 'moment';
import db from '../db.js';
import logger from './logger.js';

async function processBills(bills, selectedPeriods) {
    const periods = !!selectedPeriods ? JSON.parse(selectedPeriods) : getDefaultPeriods()

    logger.info("Processing bills for periods:", periods)

    //delete previously processed bills of current periods
    db.ActiveBill.deleteMany({dueDate: {
        $gte: new Date(periods[0].year, periods[0].month + 1, 1),
        $lt: new Date(periods[2].year, periods[2].month + 3, 1)
    }}).catch((err) => {
        logger.error("Error deleting previous active bills", err)
    })

    let billsSourceTable = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.TABLE)
    let billsSourceEmail = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.EMAIL)
    let billsSourceApi = bills.filter(bill => db.ValueSourceTypeEnum[bill.valueSourceType]==db.ValueSourceTypeEnum.API)

    const promises = [findActiveTableBills(billsSourceTable, periods),
                        findActiveEmailBills(billsSourceEmail, periods),
                        findActiveApiBills(billsSourceApi, periods)]
    const activeBills = await runParallel(promises)
    
    for (const activeBill of activeBills) {
        activeBill.save().catch((err) => {
            logger.error(`Error saving activeBill '${activeBill.name}'`, err)
        })
    }

    logger.info("Finished processing bills for periods:", periods)
}

function getBillMonth(dueDate) {
    return Number(dueDate?.getMonth()) + 1 + "/" + dueDate?.getFullYear()
}

function getSum(total, num) {
    return total + ((isNaN(num) || num == undefined) ? 0 : num);
}

function getDefaultPeriods() {
    let currentDate = new Date()
    let previousMonthDate = moment(currentDate).subtract(1, 'M').toDate()
    let nextMonthDate = moment(currentDate).add(1, 'M').toDate()
    return [ { month: previousMonthDate.getMonth(), year: previousMonthDate.getFullYear() }, 
            { month: currentDate.getMonth(), year: currentDate.getFullYear()},
            { month: nextMonthDate.getMonth(), year: nextMonthDate.getFullYear() }]
}

function findActiveTableBills(billsSourceTable, periods) {
    logger.info("findActiveTableBills started")
    const promises = []
    for (const period of periods) {
        for (const bill of billsSourceTable) {
            promises.push(findTableBills(bill, period))
        }
    }
    const bills = runParallel(promises)
    logger.info("findActiveTableBills finished")
    return bills
}

async function findTableBills(bill, period) {
    logger.info("findTableBills for bill", bill.name, "and period", period)

    let bills = []
    let table = await db.Table.findById(bill.valueSourceId).lean()
    if (!table) {
        logger.info(`No table found for bill '${bill.name}'`)
        return bills;
    }
            
    let currentPeriodDataIndex = table.data.findIndex(data => filterCurrentPeriodData(data, period))
    
    if (currentPeriodDataIndex < 0) {
        logger.info(`No data found for bill '${bill.name}' for period ${period.month + 1}/${period.year}`)
        return bills;
    }

    let currentPeriodData = table.data[currentPeriodDataIndex]
    logger.info("currentPeriodData", currentPeriodData)

    if (!currentPeriodData || !currentPeriodData.period || !currentPeriodData.period.month || !currentPeriodData.period.year) {
        logger.info(`Invalid data for bill '${bill.name}' for period ${period.month + 1}/${period.year}`)
        return bills;
    }

    let name = getBillName(bill, currentPeriodDataIndex, table.data.length)
    let users = bill.users
    let dueDate = getDateFromPeriod(currentPeriodData.period, bill.dueDay)
    let value = currentPeriodData.value
    let icon = bill.icon
    let paymentType = bill.paymentType
    bills.push(new db.ActiveBill({users, name, dueDate, value, icon, paymentType}))

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
    logger.info("findActiveEmailBills started")
    const promises = []
    for (const period of periods) {
        for (const bill of billsSourceEmail) {
            promises.push(findEmailBills(bill, period))
        }
    }
    const bills = await runParallel(promises)
    logger.info("findActiveEmailBills finished")
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
        let paymentType = bill.paymentType
        bills.push(new db.ActiveBill({users, name, dueDate, value, icon, status, paymentType}))
    }
    return bills;
}

async function parseEmailData(email, period) {
    try {
        const parser = require(`../parser/${db.DataParserEnum[email.dataParser]}`);
        let parsedData = await parser.fetch(email.address, email.subject, period)
        return parsedData
    } catch(error) {
        logger.error("Error parsing data", error)
        return []
    }
}

async function findActiveApiBills(billsSourceApi, periods) {
    logger.info("findActiveApiBills started")
    const promises = []
    for (const period of periods) {
        for (const bill of billsSourceApi) {
            promises.push(findApiBills(bill, period))
        }
    }
    const bills = await runParallel(promises)
    logger.info("findActiveApiBills finished")
    return bills
}

async function findApiBills(bill, period) {
    let bills = []
    let api = await db.API.findById(bill.valueSourceId).lean()
    if (!api) {
        logger.info(`No API config found for bill '${bill.name}'`)
        return bills
    }

    const dueDate = getDateFromPeriod(period, bill.dueDay)

    try {
        const fetchOptions = { method: api.method }
        if (api.body && ['POST', 'PUT'].includes(api.method)) {
            fetchOptions.body = api.body
            fetchOptions.headers = { 'Content-Type': 'application/json' }
        }

        const response = await fetch(api.url, fetchOptions)
        if (!response.ok) {
            logger.error(`API request failed for bill '${bill.name}': ${response.status} ${response.statusText}`)
            bills.push(new db.ActiveBill({ users: bill.users, name: bill.name, dueDate, icon: bill.icon, paymentType: bill.paymentType, status: 'ERROR' }))
            return bills
        }

        const data = await response.json()
        const raw = resolveJsonPath(data, api.value)
        const value = parseFloat(raw)
        const status = !isNaN(value) ? 'UNPAID' : 'ERROR'
        bills.push(new db.ActiveBill({ users: bill.users, name: bill.name, dueDate, value: isNaN(value) ? undefined : value, icon: bill.icon, paymentType: bill.paymentType, status }))
    } catch (error) {
        logger.error(`Error fetching API data for bill '${bill.name}'`, error)
        bills.push(new db.ActiveBill({ users: bill.users, name: bill.name, dueDate, icon: bill.icon, paymentType: bill.paymentType, status: 'ERROR' }))
    }

    return bills
}

function resolveJsonPath(obj, path) {
    return path.split('.').reduce((acc, key) => acc?.[key], obj)
}

function groupByPaymentType(bills) {
    const groups = bills.reduce((acc, bill) => {
        const type = bill.paymentType || 'PIX'
        if (!acc[type]) acc[type] = []
        acc[type].push(bill)
        return acc
    }, {})

    return Object.keys(groups).map(type => {
        const typeBills = groups[type]
        const total = typeBills.map(b => b.value).reduce(getSum, 0)
        return { type, total, bills: typeBills.sort((a, b) => a.name.localeCompare(b.name)) }
    })
}

async function runParallel(promises) {
    const results = await Promise.all(promises)
    return results.flat()
}

export default {
    getBillMonth,
    getSum,
    groupByPaymentType,
    findActiveTableBills,
    findActiveEmailBills,
    findActiveApiBills,
    processBills
}