import mongoose from 'mongoose'
import logger from './util/logger.js'

import { User } from './models/User.js'
import { ActiveBill } from './models/ActiveBill.js'
import { Email } from './models/Email.js'
import { Table } from './models/Table.js'
import { API } from './models/API.js'
import { PushNotificationSubscription } from './models/PushNotificationSubscription.js'
import { BillReminder } from './models/BillReminder.js'
import { Bill } from './models/Bill.js'

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
} from './enums.js'

export async function connectDB() {
    if (!process.env.MONGODB_IP) {
        throw new Error('MONGODB_IP is not set; refusing to start')
    }
    const DB_ADDRESS = process.env.MONGODB_IP
    const DB_PORT = process.env.MONGODB_PORT || 27017
    const DB_USER = process.env.MONGODB_USER
    const DB_PASS = process.env.MONGODB_PASSWORD
    const DB_NAME = process.env.MONGODB_DATABASE || 'lembrador-contas'

    const options = {
        user: DB_USER,
        pass: DB_PASS,
        dbName: DB_NAME
    }

    const dbUrl = `mongodb://${DB_ADDRESS}:${DB_PORT}`

    logger.info({ host: DB_ADDRESS, port: DB_PORT, database: DB_NAME }, 'Connecting to MongoDB')

    try {
        await mongoose.connect(dbUrl, options)
        logger.info({ database: DB_NAME }, 'MongoDB connected')
    } catch (err) {
        if (err.message && err.message.includes('ECONNREFUSED')) {
            logger.error({ err }, 'Could not connect to MongoDB; verify that the database is running')
        }
        throw err
    }
}

export default {
    Mongoose: mongoose,
    connectDB,
    User,
    ActiveBill,
    Email,
    Table,
    API,
    PushNotificationSubscription,
    BillReminder,
    Bill,
    PeriodFilterEnum,
    StatusEnum,
    HttpMethodEnum,
    ValueSourceTypeEnum,
    BillTypeEnum,
    PaymentTypeEnum,
    ActiveBillStatusEnum,
    DataTypeEnum,
    DataParserEnum,
}
