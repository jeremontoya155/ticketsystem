require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const flash = require('express-flash');
const methodOverride = require('method-override');
const path = require('path');
const { pool } = require('./config/db');
const { initializeDatabase } = require('./config/init-db');

async function startServer() {
  await initializeDatabase();

  const app = express();

  // View engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Middleware
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(methodOverride('_method'));
  app.use(express.static(path.join(__dirname, 'public')));

  // Session
  app.use(session({
    store: new pgSession({ pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || 'ticketsecret2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
  }));

  app.use(flash());

  // Locals globales
  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
  });

  // Routes
  app.use('/', require('./routes/auth'));
  app.use('/tickets', require('./routes/tickets'));
  app.use('/admin', require('./routes/admin'));
  app.use('/api', require('./routes/api'));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('No se pudo iniciar la aplicacion:', error.message);
  process.exit(1);
});
