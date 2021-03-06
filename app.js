var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var index = require('./routes/index');
var users = require('./routes/users');
var bills = require('./routes/bills');
var emails = require('./routes/emails');
var tables = require('./routes/tables');


var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/jquery', express.static(__dirname + '/node_modules/jquery/dist/'));
app.use('/jquery-mask', express.static(__dirname + '/node_modules/jquery-mask-plugin/dist/'));
//app.use('/tether', express.static(__dirname + '/node_modules/tether/dist/'));
app.use('/popperjs', express.static(__dirname + '/node_modules/popper.js/dist/umd/'));
app.use('/bootstrap', express.static(__dirname + '/node_modules/bootstrap/dist/'));

app.use('/', index);
app.use('/users', users);
app.use('/bills', bills);
app.use('/emails', emails);
app.use('/tables', tables);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
