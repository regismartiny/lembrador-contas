var mongoose = require('mongoose')

const DB_ADDRESS = process.env.MONGODB_IP || 'mongodb'
const DB_PORT = process.env.MONGODB_PORT || 27017
const DB_USER = process.env.MONGODB_USER
const DB_PASS = process.env.MONGODB_PASSWORD
const DB_NAME = process.env.MONGODB_DATABASE || 'lembrador-contas'

let options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    user: DB_USER,
    pass: DB_PASS,
    dbName: DB_NAME
}

mongoose.connect(`mongodb://${DB_ADDRESS}:${DB_PORT}`, options).catch((err) => {
    if (err.message.indexOf("ECONNREFUSED") !== -1) {
        console.error("Error: The server was not able to reach MongoDB. Maybe it's not running?")
        process.exit(1)
    } else {
        throw err
    }
})

const StatusEnum = {
    ATIVO: 'Ativo',
    INATIVO: 'Inativo'
}

const HttpMethodEnum = {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    DELETE: 'DELETE'
}

var userSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'O nome do Usuário é obrigatório'] },
    email: { type: String, unique: true, required: [true, 'O email é obrigatório'] },
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ATIVO', required: [true, 'A situação é obrigatória'] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'usercollection' })

// on every save, add the date
userSchema.pre('validate', function (next) {
    var self = this

    User.findOne({ email: this.email }, 'email', function (err, results) {
        if (err) {
            console.log('Erro: ', err)
        } else if (results) {
            console.warn('Resultados de validação: ', results)
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
    })
})
var User = mongoose.model('usercollection', userSchema, 'usercollection')


const ValueSourceTypeEnum = {
    TABELA: 'Tabela',
    EMAIL: 'Email',
    API: 'API'
}

var billSchema = new mongoose.Schema({
    company: { type: String, required: [true, 'O nome do Usuário é obrigatório'] },
    valueSourceType: { type: String, enum: Object.keys(ValueSourceTypeEnum), required: [true, 'O Tipo da Fonte Valor é obrigatório'] },
    valueSourceId: { type: String, required: [true, 'O id da Fonte Valor é obrigatório'] },
    dueDay: { type: Number, required: [true, 'Dia do vencimento obrigatório'] },
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ATIVO', required: [true, 'A situação é obrigatória'] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'billcollection' })

billSchema.pre('save', function (next) {
    var currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
})

var Bill = mongoose.model('billcollection', billSchema, 'billcollection')

var emailSchema = new mongoose.Schema({
    address: { type: String, unique: true, required: [true, 'O Endereço é obrigatório'] },
    subject: { type: String, unique: true, required: [true, 'O Assunto é obrigatório'] },
    valueData: [{ name: String, value: String }],
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ATIVO', required: [true, 'A situação é obrigatória'] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'emailcollection' })

emailSchema.pre('save', function (next) {
    var currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
})

var Email = mongoose.model('emailcollection', emailSchema, 'emailcollection')

var tableSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'O nome da Tabela é obrigatório'] },
    data: [{ period: { month: Number, year: Number }, value: Number }],
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ATIVO', required: [true, 'A situação é obrigatória'] },
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

var apiSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: [true, 'o Nome é obrigatório'] },
    url: { type: String, required: [true, 'A URL é obrigatória'] },
    method: { type: String, enum: Object.keys(HttpMethodEnum), default: 'GET', required: [true, 'O Método é obrigatório'] },
    body: { type: String },
    reponseValue: { type: String },
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ATIVO', required: [true, 'A situação é obrigatória'] },
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

const ReminderStatusEnum = {
    CREATED: 'Criado',
    PAYD: 'Pago',
    CANCELED: 'Cancelado'
}

var billReminderSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'O título é obrigatório'] },
    fileLink: { type: String },
    status: { type: String, enum: Object.keys(ReminderStatusEnum), required: [true, 'O status é obrigatório'] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'billremindercollection' })

billReminderSchema.pre('save', function (next) {
    var currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
})

var BillReminder = mongoose.model('billremindercollection', billReminderSchema, 'billremindercollection')

module.exports = { Mongoose: mongoose, User, Bill, Email, Table, API, BillReminder, StatusEnum, HttpMethodEnum, ValueSourceTypeEnum, ReminderStatusEnum }