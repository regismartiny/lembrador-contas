import mongoose from 'mongoose'
import { ActiveBillStatusEnum, PaymentTypeEnum } from '../enums.js'

const activeBillSchema = new mongoose.Schema({
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'billcollection', default: null },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'usercollection' }],
    name: { type: String, required: [true, 'O nome é obrigatório'] },
    company: { type: String, default: '' },
    dueDate: { type: Date },
    value: { type: Number },
    icon: { type: String },
    status: { type: String, enum: Object.keys(ActiveBillStatusEnum), default: 'UNPAID', required: [true, 'A situação é obrigatória'] },
    paymentType: { type: String, enum: Object.keys(PaymentTypeEnum), default: 'PIX', required: [true, 'O tipo de pagamento é obrigatório'] },
    referencePeriod: { type: String, required: [true, 'O período de referência é obrigatório'] },
    valueSourceType: { type: String, default: '' },
    attachmentFilename: { type: String, default: '' },
    pixCode: { type: String, default: '' },
    barcode: { type: String, default: '' },
    notes: { type: String, default: '' },
    paidAt: { type: Date, default: null },
    paidBy: { type: String, default: '' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'activebillcollection' })

activeBillSchema.pre('save', function (next) {
    const currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
})

const ActiveBill = mongoose.model('activebillcollection', activeBillSchema, 'activebillcollection')
ActiveBill.collection.createIndex( { name: 1, dueDate: 1 }, { unique: true } )

export { ActiveBill }
