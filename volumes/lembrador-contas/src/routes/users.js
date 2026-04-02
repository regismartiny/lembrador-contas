import express from 'express';
import template from './template.js';
import db from '../db.js';

const router = express.Router();

/* GET UserList page. */
router.get('/list', async function (req, res, next) {
    try {
        const users = await db.User.find({}).lean()
        const userList = users.sort((a,b)=>a.name.localeCompare(b.name))
        res.render('user/userList', { template, title: 'Usuários', userList, statusEnum: db.StatusEnum });
    } catch (err) {
        next(err)
    }
});

/* GET New User page. */
router.get('/new', function (req, res) {
    res.render('user/newUser', { template, title: 'Cadastro de Usuário' });
});

/* POST to Add User Service */
router.post('/add', async function (req, res, next) {
    var name = (req.body.name || '').trim();
    var email = (req.body.email || '').trim().toLowerCase();

    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).send('Nome e email válido são obrigatórios.')
    }

    try {
        const user = new db.User({ name, email });
        await user.save();
        console.log("User saved");
        res.redirect("/users/list");
    } catch (err) {
        next(err)
    }
});

/* GET Edit User page. */
router.get('/edit/:id', async function (req, res, next) {
    try {
        const user = await db.User.findById(req.params.id)
        res.render('user/editUser', { template, title: 'Edição de Usuário', statusEnum: db.StatusEnum, user })
    } catch (err) {
        next(err)
    }
})

/* POST to Update User */
router.post('/update', async function (req, res, next) {
    let userId = req.body.id
    let name = (req.body.name || '').trim()
    let email = (req.body.email || '').trim().toLowerCase()
    let status = req.body.status

    if (!userId || !name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).send('Dados inválidos.')
    }

    try {
        await db.User.findOneAndUpdate({ _id: userId }, { $set: { name, email, status } }, { new: true })
        console.log("User updated")
        res.redirect("/users/list")
    } catch (err) {
        next(err)
    }
})

/* GET Remove User */
router.get('/remove/:id', async function (req, res, next) {
    try {
        await db.User.findOneAndDelete({ _id: req.params.id })
        console.log("User removed")
        res.redirect("/users/list")
    } catch (err) {
        next(err)
    }
})


export default router;
