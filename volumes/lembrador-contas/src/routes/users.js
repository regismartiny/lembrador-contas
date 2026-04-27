import express from 'express';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import template from './template.js';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';
import { validateBody } from '../middleware/validate.js';

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
router.post('/add', requireAdmin, validateBody({
    name: { required: true, trim: true, message: 'Nome é obrigatório.' },
    email: { required: true, trim: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMessage: 'Email inválido.' }
}), asyncHandler(async function (req, res) {
    const name = req.body.name;
    const email = req.body.email.toLowerCase();
    const admin = req.body.admin === 'true';

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
router.post('/update', requireAdmin, validateBody({
    id: { required: true, message: 'ID é obrigatório.' },
    name: { required: true, trim: true, message: 'Nome é obrigatório.' },
    email: { required: true, trim: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMessage: 'Email inválido.' }
}), asyncHandler(async function (req, res) {
    const userId = req.body.id
    const name = req.body.name
    const email = req.body.email.toLowerCase()
    const status = req.body.status
    const admin = req.body.admin === 'true';

    logger.info(`Updating user - admin value from form: ${req.body.admin}, parsed as: ${admin}`)

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
