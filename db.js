var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/lembradorcontas');

var userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    email: String,
    created_at: Date,
    updated_at: Date
}, { collection: 'usercollection' }
);

// on every save, add the date
userSchema.pre('save', function(next) {
  // get the current date
  var currentDate = new Date();

  // change the updated_at field to current date
  this.updated_at = currentDate;

  // if created_at doesn't exist, add to that field
  if (!this.created_at)
    this.created_at = currentDate;

  next();
});

var billSchema = new mongoose.Schema({
    company: String,
    valueSourceType: String,
    valueSourceId: String,
    created_at: Date,
    updated_at: Date
}, { collection: 'billcollection' }
);

billSchema.pre('save', function(next) {
  var currentDate = new Date();
  this.updated_at = currentDate;
  if (!this.created_at)
    this.created_at = currentDate;
  next();
});

var emailSchema = new mongoose.Schema({
    address: { type: String, unique: true },
    created_at: Date,
    updated_at: Date
}, { collection: 'emailcollection' }
);

emailSchema.pre('save', function(next) {
  var currentDate = new Date();
  this.updated_at = currentDate;
  if (!this.created_at)
    this.created_at = currentDate;
  next();
});

var tableSchema = new mongoose.Schema({
    name: { type: String, required: true },
    data: [ { period: { month: Number, year: Number }, value: Number } ],
    created_at: Date,
    updated_at: Date
}, { collection: 'tablecollection' }
);

tableSchema.pre('save', function(next) {
  var currentDate = new Date();
  this.updated_at = currentDate;
  if (!this.created_at)
    this.created_at = currentDate;
  next();
});

const ValueSourceType = {
    TABELA : 'Tabela',
    EMAIL : 'Email',
}

module.exports = { Mongoose: mongoose, UserSchema: userSchema, BillSchema: billSchema, EmailSchema: emailSchema, TableSchema: tableSchema, ValueSourceType: ValueSourceType }