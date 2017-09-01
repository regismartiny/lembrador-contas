var mongoose = require('mongoose');

var dbUser = process.env.MONGODB_USER;
var dbPass = process.env.MONGODB_PASSWORD;

var connString = 'mongodb://';
if (dbUser && dbPass) { connString +=  dbUser + ':' + dbPass + '@' }
connString += 'localhost:27017/lembradorcontas';

mongoose.connect(connString).catch((err)=>{
  console.log('Error connecting to database: ', err);
});

var userSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'O nome do Usuário é obrigatório'] },
  email: { type: String, unique: true , required: [true, 'O email é obrigatório'] },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'usercollection' }
);

// on every save, add the date
userSchema.pre('validate', function (next) {
  var self = this;

  User.findOne({ email: this.email }, 'email', function (err, results) {
    if (err) {
      console.log('Erro: ', err);
    } else if (results) {
      console.warn('Resultados de validação: ', results);
      self.invalidate("email", "Email deve ser único");
      next(new Error("email must be unique"));
    } else {
      // get the current date
      var currentDate = new Date();

      // change the updated_at field to current date
      this.updated_at = currentDate;

      // if created_at doesn't exist, add to that field
      if (!this.created_at)
        this.created_at = currentDate;
      next();
    }
  });
});
var User = mongoose.model('usercollection', userSchema, 'usercollection');



var billSchema = new mongoose.Schema({
  company: { type: String, required: [true, 'O nome do Usuário é obrigatório'] },
  valueSourceType: { type: String, required: [true, 'O Tipo da Fonte Valor é obrigatório'] },
  valueSourceId: { type: String, required: [true, 'O id da Fonte Valor é obrigatório'] },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'billcollection' }
);

billSchema.pre('save', function (next) {
  var currentDate = new Date();
  this.updated_at = currentDate;
  if (!this.created_at)
    this.created_at = currentDate;
  next();
});

var Bill = mongoose.model('billcollection', billSchema, 'billcollection');



var emailSchema = new mongoose.Schema({
  address: { type: String, unique: true, required: [true, 'O nome Endereço é obrigatório'] },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'emailcollection' }
);

emailSchema.pre('save', function (next) {
  var currentDate = new Date();
  this.updated_at = currentDate;
  if (!this.created_at)
    this.created_at = currentDate;
  next();
});

var Email = mongoose.model('emailcollection', emailSchema, 'emailcollection');



var tableSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'O nome da Tabela é obrigatório'] },
  data: [{ period: { month: Number, year: Number }, value: Number }],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'tablecollection' }
);

tableSchema.pre('save', function (next) {
  var currentDate = new Date();
  this.updated_at = currentDate;
  if (!this.created_at)
    this.created_at = currentDate;
  next();
});

var Table = mongoose.model('tablecollection', tableSchema, 'tablecollection');

const ValueSourceType = {
  TABELA: 'Tabela',
  EMAIL: 'Email',
}

module.exports = { Mongoose: mongoose, User, Bill, Email, Table, ValueSourceType: ValueSourceType }