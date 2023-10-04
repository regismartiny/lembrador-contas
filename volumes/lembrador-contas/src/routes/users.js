var express = require('express')
var router = express.Router()
var template = require('./template')
var db = require("../db")


/* GET UserList page. */
router.get('/list', async function (req, res) {
  try {
    let users = await db.User.find({}).lean().exec()
    const userList = users.sort((a,b)=>a.name.localeCompare(b.name))
    res.render('user/userList', { template, title: 'Usuários', userList,  statusEnum: db.StatusEnum })
  } catch(err) {
    handleError(err, res)
    return err
  }
})

/* GET New User page. */
router.get('/new', function (req, res) {
  res.render('user/newUser', { template, title: 'Cadastro de Usuário' })
})

/* POST to Add User Service */
router.post('/add', async function (req, res) {
  var name = req.body.name
  var email = req.body.email

  try {
    console.log(req.body)
    await db.User.create({ name, email })
    console.log("User saved")
    res.redirect("/users/list")
  } catch(err) {
    handleError(err, res)
    return err
  }
})

/* GET Edit User page. */
router.get('/edit/:id', async function (req, res) {
  let userId = req.params.id

  try {
    let user = await db.User.findById(userId)
    res.render('user/editUser', { template, title: 'Edição de Usuário', statusEnum: db.StatusEnum, user }) 
  } catch(err) {
    handleError(err, res)
    return err
  }
})

/* POST to Update User */
router.post('/update', async function (req, res) {
  let userId = req.body.id
  let name = req.body.name
  let email = req.body.email
  let status = req.body.status

  try {
    await db.User.findOneAndUpdate({ _id: userId }, { $set: { name, email, status } }, { new: true })
    console.log("User updated")
    res.redirect("/users/list")       
  } catch(err) {
    handleError(err, res)
    return err
  }
})

/* GET Remove User */
router.get('/remove/:id', async function (req, res) {
  let userId = req.params.id

  try {
    await db.User.findOneAndRemove({ _id: userId })
    console.log("User removed")
    res.redirect("/users/list")     
  } catch(err) {
    handleError(err, res)
    return err
  }
})

function handleError(error, res) {
  console.log("Error! " + error.message)
  res.render('error', { message: '', error: error})
}


module.exports = router
