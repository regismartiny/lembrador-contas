import mongoose from 'mongoose'
import logger from './util/logger.js'

import { User } from './models/User.js'
import { Bill } from './models/Bill.js'
import { ActiveBill } from './models/ActiveBill.js'
import { Email } from './models/Email.js'
import { Table } from './models/Table.js'
import { API } from './models/API.js'
import { BillReminder } from './models/BillReminder.js'
import { PushNotificationSubscription } from './models/PushNotificationSubscription.js'

import {
    PeriodFilterEnum,
    StatusEnum,
    HttpMethodEnum,
    ValueSourceTypeEnum,
    BillTypeEnum,
    PaymentTypeEnum,
    ActiveBillStatusEnum,
    DataTypeEnum,
    DataParserEnum,
    ReminderStatusEnum,
} from './enums.js'

const DB_ADDRESS = process.env.MONGODB_IP || '192.168.2.11'
const DB_PORT = process.env.MONGODB_PORT || 27017
const DB_USER = process.env.MONGODB_USER
const DB_PASS = process.env.MONGODB_PASSWORD
const DB_NAME = process.env.MONGODB_DATABASE || 'lembrador-contas'

let options = {
    user: DB_USER,
    pass: DB_PASS,
    dbName: DB_NAME
}

let dbUrl = `mongodb://${DB_ADDRESS}:${DB_PORT}`

logger.info({ host: DB_ADDRESS, port: DB_PORT, database: DB_NAME }, 'Connecting to MongoDB')

mongoose.connect(dbUrl, options).catch((err) => {
    if (err.message.indexOf("ECONNREFUSED") !== -1) {
        logger.error({ err }, 'Could not connect to MongoDB; verify that the database is running')
        process.exit(1)
    } else {
        throw err
    }
}).then(() => logger.info({ database: DB_NAME }, 'MongoDB connected'))

export default {
    Mongoose: mongoose,
    User,
    Bill,
    ActiveBill,
    Email,
    Table,
    API,
    BillReminder,
    PushNotificationSubscription,
    PeriodFilterEnum,
    StatusEnum,
    HttpMethodEnum,
    ValueSourceTypeEnum,
    BillTypeEnum,
    PaymentTypeEnum,
    ActiveBillStatusEnum,
    DataTypeEnum,
    DataParserEnum,
    ReminderStatusEnum,
}
