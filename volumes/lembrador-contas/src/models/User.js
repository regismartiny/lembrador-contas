import mongoose from 'mongoose'
import logger from '../util/logger.js'
import { StatusEnum } from '../enums.js'

var userSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'O nome do Usuário é obrigatório'] },
    email: { type: String, unique: true, required: [true, 'O email é obrigatório'] },
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ACTIVE', required: [true, 'A situação é obrigatória'] },
    admin: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'usercollection' })

// on every save, add the date
userSchema.pre('validate', function (next) {
    var self = this

    User.findOne({ email: this.email }, 'email').then(function (results) {
        if (results) {
            logger.warn('Resultados de validação: ', results)
            self.invalidate("email", "Email deve ser único")
            next(new Error("email must be unique"))
        } else {
            // get the current date
            var currentDate = new Date()

            // change the updated_at field to current date
            this.updated_at = currentDate

            // if created_at doesn't exist, add to that field
            if (!this.created_at)
                this.created_at = currentDate
            next()
        }
    }).catch(err => {
        logger.info('Erro: ', err)
    })
})

var User = mongoose.model('usercollection', userSchema, 'usercollection')

export { User }
