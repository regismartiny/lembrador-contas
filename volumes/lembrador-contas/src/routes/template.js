import fs from "fs";

const head = fs.readFileSync('./src/views/templates/head.html', 'utf8');
const navbar = fs.readFileSync('./src/views/templates/navbar.html', 'utf8');
const scripts = fs.readFileSync('./src/views/templates/scripts.html', 'utf8');
const template = { head, navbar, scripts };

export default template;