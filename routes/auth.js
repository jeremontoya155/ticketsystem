const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { requireLogin, normalizeRole } = require('../middleware/auth');

router.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/tickets');
  res.redirect('/login');
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/tickets');
  res.render('auth/login', { title: 'Iniciar Sesión' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1 AND activo = true', [email]);
    const user = result.rows[0];
    if (!user || !await bcrypt.compare(password, user.password)) {
      req.flash('error', 'Email o contraseña incorrectos');
      return res.redirect('/login');
    }
    req.session.user = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: normalizeRole(user.rol) || user.rol,
      cliente_id: user.cliente_id
    };
    req.flash('success', `Bienvenido, ${user.nombre}!`);
    res.redirect('/tickets');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error del servidor');
    res.redirect('/login');
  }
});

router.post('/logout', requireLogin, (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;
