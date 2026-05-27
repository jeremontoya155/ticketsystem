const ROLE_ALIASES = {
  admin: 'admin',
  admin_soporte: 'admin_soporte',
  admin_desarrollo: 'admin_desarrollo',
  soporte: 'tecnico_soporte',
  tecnico_soporte: 'tecnico_soporte',
  desarrollo: 'tecnico_desarrollo',
  tecnico_desarrollo: 'tecnico_desarrollo',
  cliente: 'cliente'
};

const ADMIN_ROLES = new Set(['admin', 'admin_soporte', 'admin_desarrollo']);
const DEV_ROLES = new Set(['admin', 'admin_desarrollo', 'tecnico_desarrollo']);
const SUPPORT_ROLES = new Set(['admin', 'admin_soporte', 'tecnico_soporte']);
const ASSIGNMENT_MANAGER_ROLES = new Set(['admin', 'admin_soporte', 'admin_desarrollo']);
const INTERNAL_ROLES = new Set([
  ...ADMIN_ROLES,
  'tecnico_soporte',
  'tecnico_desarrollo'
]);

function normalizeRole(role) {
  return ROLE_ALIASES[String(role || '').trim()] || null;
}

function isClient(user) {
  return normalizeRole(user?.rol) === 'cliente';
}

function isInternal(user) {
  return INTERNAL_ROLES.has(normalizeRole(user?.rol));
}

function isAdmin(user) {
  return ADMIN_ROLES.has(normalizeRole(user?.rol));
}

function canAccessDevelopment(user) {
  return DEV_ROLES.has(normalizeRole(user?.rol));
}

function canAccessSupport(user) {
  return SUPPORT_ROLES.has(normalizeRole(user?.rol));
}

function canManageAssignments(user) {
  return ASSIGNMENT_MANAGER_ROLES.has(normalizeRole(user?.rol));
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Debés iniciar sesión');
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !isAdmin(req.session.user)) {
    req.flash('error', 'Acceso restringido a administradores');
    return res.redirect('/tickets');
  }
  next();
}

function requireDesarrollo(req, res, next) {
  if (!req.session.user || !canAccessDevelopment(req.session.user)) {
    req.flash('error', 'Acceso restringido');
    return res.redirect('/tickets');
  }
  next();
}

module.exports = {
  requireLogin,
  requireAdmin,
  requireDesarrollo,
  normalizeRole,
  isClient,
  isInternal,
  isAdmin,
  canAccessDevelopment,
  canAccessSupport,
  canManageAssignments
};
