var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/nodetest1');

var userSchema = new mongoose.Schema({
    username: String,
    email: String
}, { collection: 'usercollection' }
);

var billSchema = new mongoose.Schema({
    company: String,
    valueSource: String
}, { collection: 'billcollection' }
);

module.exports = { Mongoose: mongoose, UserSchema: userSchema, BillSchema: billSchema }