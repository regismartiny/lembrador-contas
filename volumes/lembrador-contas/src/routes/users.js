import express from 'express';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import template from './template.js';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

/* GET UserList page. */
router.get('/list', asyncHandler(async function (req, res) {
    const users = await db.User.find({}).lean()
    const userList = users.sort((a,b)=>a.name.localeCompare(b.name))
    res.render('user/userList', { template, title: 'Usuários', userList, statusEnum: db.StatusEnum });
}));

/* GET New User page. */
router.get('/new', requireAdmin, function (req, res) {
    res.render('user/newUser', { template, title: 'Cadastro de Usuário' });
});

/* POST to Add User Service */
router.post('/add', requireAdmin, asyncHandler(async function (req, res) {
    var name = (req.body.name || '').trim();
    var email = (req.body.email || '').trim().toLowerCase();
    var admin = req.body.admin === 'true';

    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).send('Nome e email válido são obrigatórios.')
    }

    const user = new db.User({ name, email, admin });
    await user.save();
    logger.info("User saved");
    res.redirect("/users/list");
}));

/* GET Edit User page. */
router.get('/edit/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    const user = await db.User.findById(req.params.id)
    res.render('user/editUser', { template, title: 'Edição de Usuário', statusEnum: db.StatusEnum, user })
}));

/* POST to Update User */
router.post('/update', requireAdmin, asyncHandler(async function (req, res) {
    let userId = req.body.id
    let name = (req.body.name || '').trim()
    let email = (req.body.email || '').trim().toLowerCase()
    let status = req.body.status
    let admin = req.body.admin === 'true';

    logger.info(`Updating user - admin value from form: ${req.body.admin}, parsed as: ${admin}`)

    if (!userId || !name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).send('Dados inválidos.')
    }

    await db.User.findOneAndUpdate(
        { _id: userId },
        { $set: { name, email, status, admin, updated_at: new Date() } },
        { new: true, runValidators: true }
    )
    logger.info("User updated")
    res.redirect("/users/list")
}));

/* POST Remove User */
router.post('/remove/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    await db.User.findOneAndDelete({ _id: req.params.id })
    logger.info("User removed")
    res.redirect("/users/list")
}));


export default router;
