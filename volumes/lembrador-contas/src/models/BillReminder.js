import mongoose from 'mongoose'
import { ReminderStatusEnum } from '../enums.js'

const billReminderSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'O título é obrigatório'] },
    body: { type: String },
    fileLink: { type: String },
    status: { type: String, enum: Object.keys(ReminderStatusEnum), required: [true, 'O status é obrigatório'] },
    dueDate: { type: Date },
    daysBeforeDue: { type: Number, default: 3 },
    activeBill: { type: mongoose.Schema.Types.ObjectId, ref: 'activebillcollection' },
    notifiedAt: { type: Date, default: null },
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
