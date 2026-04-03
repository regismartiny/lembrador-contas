import mongoose from 'mongoose'
import { StatusEnum } from '../enums.js'

var tableSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'O nome da Tabela é obrigatório'] },
    data: [{ period: { month: Number, year: Number }, value: Number }],
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ACTIVE', required: [true, 'A situação é obrigatória'] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'tablecollection' })

tableSchema.pre('save', function (next) {
    var currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
})

var Table = mongoose.model('tablecollection', tableSchema, 'tablecollection')

export { Table }
