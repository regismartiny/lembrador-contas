import mongoose from 'mongoose'
import { StatusEnum, ValueSourceTypeEnum, BillTypeEnum, PaymentTypeEnum } from '../enums.js'

const billSchema = new mongoose.Schema({
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'usercollection' }],
    name: { type: String, required: [true, 'O nome é obrigatório'] },
    company: { type: String, required: [true, 'O nome da Empresa é obrigatório'] },
    type: { type: String, enum: Object.keys(BillTypeEnum), default: 'RECURRENT_SERVICE', required: [true, 'O Tipo da Conta é obrigatório'] },
    valueSourceType: { type: String, enum: Object.keys(ValueSourceTypeEnum), required: [true, 'O Tipo da Fonte Valor é obrigatório'] },
    valueSourceId: { type: String, required: [true, 'O id da Fonte Valor é obrigatório'] },
    dueDay: { type: Number, required: [true, 'O Dia do Vencimento é obrigatório'] },
    icon: { type: String },
    paymentType: { type: String, enum: Object.keys(PaymentTypeEnum), default: 'PIX', required: [true, 'O tipo de pagamento é obrigatório'] },
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ACTIVE', required: [true, 'A situação é obrigatória'] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'billcollection' })

billSchema.pre('save', function (next) {
    const currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
})

const Bill = mongoose.model('billcollection', billSchema, 'billcollection')

export { Bill }
