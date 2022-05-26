var mongoose = require('mongoose');

const SERVER_IP_ADDRESS = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1'
const DB_PORT = process.env.MONGODB_PORT || 55000
const DB_USER = process.env.MONGODB_USER || 'docker'
const DB_PASS = process.env.MONGODB_PASSWORD || 'mongopw'
const DB_SERVICE = process.env.DATABASE_SERVICE_NAME || 'mongodb'
const DB_NAME = process.env.MONGODB_DATABASE || 'admin'
var connString = DB_SERVICE + '://';

(() => {
    if (DB_USER && DB_PASS) { 
        connString += DB_USER + ':' + DB_PASS + '@' 
    }
    connString += SERVER_IP_ADDRESS + ':' + DB_PORT + '/' + DB_NAME
})()

mongoose.connect(connString).catch((err) => {
    console.log('connString: ', connString)
    console.log('Error connecting to database: ', err)
})

const StatusEnum = {
    ATIVO: 'Ativo',
    INATIVO: 'Inativo'
}

var userSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'O nome do Usuário é obrigatório'] },
    email: { type: String, unique: true, required: [true, 'O email é obrigatório'] },
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ATIVO',  required: [true, 'A situação é obrigatória']},
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'usercollection' })

// on every save, add the date
userSchema.pre('validate', function(next) {
    var self = this

    User.findOne({ email: this.email }, 'email', function(err, results) {
        if (err) {
            console.log('Erro: ', err);
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
            next();
        }
    });
});
var User = mongoose.model('usercollection', userSchema, 'usercollection')


const ValueSourceTypeEnum = {
    TABELA: 'Tabela',
    EMAIL: 'Email'
}

var billSchema = new mongoose.Schema({
    company: { type: String, required: [true, 'O nome do Usuário é obrigatório'] },
    valueSourceType: { type: String, enum : Object.keys(ValueSourceTypeEnum), required: [true, 'O Tipo da Fonte Valor é obrigatório'] },
    valueSourceId: { type: String, required: [true, 'O id da Fonte Valor é obrigatório'] },
    dueDay: { type: Number, required: [true, 'Dia do vencimento obrigatório'] },
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ATIVO', required: [true, 'A situação é obrigatória']},
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'billcollection' })

billSchema.pre('save', function(next) {
    var currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
});

var Bill = mongoose.model('billcollection', billSchema, 'billcollection')



var emailSchema = new mongoose.Schema({
    address: { type: String, unique: true, required: [true, 'O Endereço é obrigatório'] },
    subject: { type: String, unique: true, required: [true, 'O Assunto é obrigatório'] },
    valueData: [{ name: String, value: String }],
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ATIVO',  required: [true, 'A situação é obrigatória']},
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'emailcollection' })

emailSchema.pre('save', function(next) {
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
    status: { type: String, enum: Object.keys(StatusEnum), default: 'ATIVO',  required: [true, 'A situação é obrigatória']},
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'tablecollection' })

tableSchema.pre('save', function(next) {
    var currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
});

var Table = mongoose.model('tablecollection', tableSchema, 'tablecollection')


const ReminderStatusEnum = {
    CREATED: 'Criado',
    PAYD: 'Pago',
    CANCELED: 'Cancelado'
}

var billReminderSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'O título é obrigatório'] },
    fileLink: { type: String },
    status: { type: String, enum : Object.keys(ReminderStatusEnum), required: [true, 'O status é obrigatório'] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'billremindercollection' })

billReminderSchema.pre('save', function(next) {
    var currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
});

var BillReminder = mongoose.model('billremindercollection', billReminderSchema, 'billremindercollection')

module.exports = { Mongoose: mongoose, User, Bill, Email, Table, BillReminder, StatusEnum, ValueSourceTypeEnum, ReminderStatusEnum }