import mongoose from 'mongoose'
import { ReminderStatusEnum } from '../enums.js'

const billReminderSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'O título é obrigatório'] },
    fileLink: { type: String },
    status: { type: String, enum: Object.keys(ReminderStatusEnum), required: [true, 'O status é obrigatório'] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'billremindercollection' })

billReminderSchema.pre('save', function (next) {
    const currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
})

const BillReminder = mongoose.model('billremindercollection', billReminderSchema, 'billremindercollection')

export { BillReminder }
