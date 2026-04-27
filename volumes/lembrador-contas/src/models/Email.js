import mongoose from 'mongoose'
import { StatusEnum, DataParserEnum } from '../enums.js'

const emailSchema = new mongoose.Schema({
    address: { type: String, unique: true, required: [true, 'O Endereço é obrigatório'] },
    subject: { type: String, unique: true, required: [true, 'O Assunto é obrigatório'] },
    dataParser: { type: String, enum: Object.keys(DataParserEnum), default: 'CPFL_EMAIL', required: [true, 'O parser de dados é obrigatório'] },
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ACTIVE', required: [true, 'A situação é obrigatória'] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'emailcollection' })

emailSchema.pre('save', function (next) {
    const currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
})

const Email = mongoose.model('emailcollection', emailSchema, 'emailcollection')

export { Email }
