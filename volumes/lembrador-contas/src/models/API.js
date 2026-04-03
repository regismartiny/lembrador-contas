import mongoose from 'mongoose'
import { StatusEnum, HttpMethodEnum } from '../enums.js'

var apiSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: [true, 'o Nome é obrigatório'] },
    url: { type: String, required: [true, 'A URL é obrigatória'] },
    method: { type: String, enum: Object.keys(HttpMethodEnum), default: 'GET', required: [true, 'O Método é obrigatório'] },
    body: { type: String },
    value: { type: String, required: [true, 'O Valor é obrigatório'] },
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ACTIVE', required: [true, 'A situação é obrigatória'] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'apicollection' })

apiSchema.pre('save', function (next) {
    var currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
})

var API = mongoose.model('apicollection', apiSchema, 'apicollection')

export { API }
