var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Lembrador de Contas' });
});

/* GET UserList page. */
router.get('/userList', function(req, res) {
  var db = require("../db");
  var Users = db.Mongoose.model('usercollection', db.UserSchema, 'usercollection');
  Users.find({}).lean().exec(
     function (e, docs) {
        res.render('userList', { "userList": docs });
  });
});

/* GET BillList page. */
router.get('/billList', function(req, res) {
  var db = require("../db");
  var Bills = db.Mongoose.model('billcollection', db.BillSchema, 'billcollection');
  Bills.find({}).lean().exec(
     function (e, docs) {
        res.render('billList', { "billList": docs });
  });
});

/* GET New User page. */
router.get('/newUser', function(req, res) {
  res.render('newUser', { title: 'Adicionar Novo Usuário' });
  });

/* POST to Add User Service */
router.post('/addUser', function (req, res) {
  
      var db = require("../db");
      var userName = req.body.username;
      var userEmail = req.body.useremail;
  
      var Users = db.Mongoose.model('usercollection', db.UserSchema, 'usercollection');
      var user = new Users({ username: userName, email: userEmail });
      user.save(function (err) {
          if (err) {
              console.log("Error! " + err.message);
              return err;
          }
          else {
              console.log("Post saved");
              res.redirect("userlist");
          }
      });
  });

/* GET New Bill page. */
router.get('/newBill', function(req, res) {
  res.render('newBill', { title: 'Adicionar Nova Conta' });
  });

/* POST to Add Bill */
router.post('/addBill', function (req, res) {
  
      var db = require("../db");
      var billCompany = req.body.company;
      var billValueSource = req.body.valueSource;
  
      var Bills = db.Mongoose.model('billcollection', db.BillSchema, 'billcollection');
      var bill = new Bills({ company: billCompany, valueSource: billValueSource });
      bill.save(function (err) {
          if (err) {
              console.log("Error! " + err.message);
              return err;
          }
          else {
              console.log("Post saved");
              res.redirect("billList");
          }
      });
  });

module.exports = router;
