var fs = require("fs")

var head = fs.readFileSync('./src/views/templates/head.html', 'utf8')
var navbar = fs.readFileSync('./src/views/templates/navbar.html', 'utf8')
var scripts = fs.readFileSync('./src/views/templates/scripts.html', 'utf8')
var template = { head, navbar, scripts }

module.exports = template