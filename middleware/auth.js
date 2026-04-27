function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Debés iniciar sesión');
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.rol !== 'admin') {
    req.flash('error', 'Acceso restringido a administradores');
    return res.redirect('/tickets');
  }
  next();
}

function requireDesarrollo(req, res, next) {
  if (!req.session.user || !['admin', 'desarrollo'].includes(req.session.user.rol)) {
    req.flash('error', 'Acceso restringido');
    return res.redirect('/tickets');
  }
  next();
}

module.exports = { requireLogin, requireAdmin, requireDesarrollo };
