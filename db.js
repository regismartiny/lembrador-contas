var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/lembradorcontas');

var userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    email: String
}, { collection: 'usercollection' }
);

var billSchema = new mongoose.Schema({
    company: String,
    valueSourceType: String,
    valueSourceId: String
}, { collection: 'billcollection' }
);

var emailSchema = new mongoose.Schema({
    address:{ type: String, unique: true }
}, { collection: 'emailcollection' }
);

const ValueSourceType = {
    TABELA : 'Tabela',
    EMAIL : 'Email',
}

module.exports = { Mongoose: mongoose, UserSchema: userSchema, BillSchema: billSchema, EmailSchema: emailSchema, ValueSourceType: ValueSourceType }