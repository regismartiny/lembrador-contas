var express = require('express');
var router = express.Router();
var template = require('./template');
var db = require("../db");


/* GET UserList page. */
router.get('/list', function (req, res) {
  db.User.find({}).lean().exec(
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
  var name = req.body.name;
  var email = req.body.email;

  var user = new db.User({ name, email });
  user.save(function (err) {
    if (err) {
      handleError(err);
      return err;
    }
    else {
      console.log("User saved");
      res.redirect("/users/list");
    }
  });
});

/* GET Edit User page. */
router.get('/edit/:id', function (req, res) {
  let userId = req.params.id;

  db.User.findById(userId, function (err, user) {
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
  let name = req.body.name;
  let email = req.body.email;

  db.User.findOneAndUpdate({ _id: userId }, { $set: { name, email } }, { new: true }, function (err, user) {
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

  db.User.findOneAndRemove({ _id: userId }, function (err, user) {
    if (err) {
      handleError(err);
      return err;
    } else {
      console.log("User removed");
      res.redirect("/users/list");
    }
  });
});

function handleError(error) {
  console.log("Error! " + error.message);
}


module.exports = router;
