var express = require('express');
var router = express.Router();
var template = require('./template');
var db = require("../db");

var Users = db.Mongoose.model('usercollection', db.UserSchema, 'usercollection');

/* GET UserList page. */
router.get('/list', function (req, res) {
  Users.find({}).lean().exec(
    function (e, docs) {
      res.render('user/userList', { template, title: 'Lista de Usuários', userList: docs });
    });
});

/* GET New User page. */
router.get('/new', function (req, res) {
  res.render('user/newUser', { template, title: 'Cadastro de Usuário' });
});

/* POST to Add User Service */
router.post('/add', function (req, res) {
  var userName = req.body.username;
  var userEmail = req.body.useremail;

  var user = new Users({ username: userName, email: userEmail });
  user.save(function (err) {
    if (err) {
      handleError(err);
      return err;
    }
    else {
      console.log("Post saved");
      res.redirect("/users/list");
    }
  });
});

/* GET Edit User page. */
router.get('/edit/:id', function (req, res) {
  let userId = req.params.id;

  var Users = db.Mongoose.model('usercollection', db.UserSchema, 'usercollection');
  Users.findById(userId, function (err, user) {
    if (err) {
      handleError(err);
      return err;
    } else {
      res.render('user/editUser', { template, title: 'Edição de Usuário', user });
    }
  });
});

/* POST to Update User */
router.post('/update', function (req, res) {
  let userId = req.body.id;
  let username = req.body.username;
  let userEmail = req.body.email;

  Users.findOneAndUpdate({ _id: userId }, { $set: { username: username, email: userEmail } }, { new: true }, function (err, user) {
    if (err) {
      handleError(err);
      return err;
    }
    else {
      console.log("User updated");
      res.redirect("/users/list");
    }
  });
});

/* GET Remove User */
router.get('/remove/:id', function (req, res) {
  let userId = req.params.id;

  Users.findOneAndRemove({ _id: userId }, function (err, user) {
    if (err) {
      handleError(err);
      return err;
    } else {
      res.redirect("/users/list");
    }
  });
});

function handleError(error) {
  console.log("Error! " + error.message);
}


module.exports = router;
