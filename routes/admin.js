const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { requireLogin, requireAdmin, normalizeRole } = require('../middleware/auth');

function asBool(value) {
  return value === 'on' || value === 'true' || value === true;
}

function asNullableInt(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return parseInt(value, 10);
}

function asNullableText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeChannel(value, fallback = 'telefono') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['telefono', 'whatsapp', 'email'].includes(normalized) ? normalized : fallback;
}

function parseContactRows(rawContactos) {
  const rows = Array.isArray(rawContactos)
    ? rawContactos
    : (rawContactos && typeof rawContactos === 'object' ? Object.values(rawContactos) : []);

  const contacts = rows
    .map((row, index) => {
      const nombre = asNullableText(row?.nombre);
      const lugar = asNullableText(row?.lugar);
      const telefono = asNullableText(row?.telefono);
      const email = asNullableText(row?.email);
      const notas = asNullableText(row?.notas);

      if (!nombre && !telefono && !email && !lugar && !notas) {
        return null;
      }

      const fallbackChannel = telefono ? 'whatsapp' : (email ? 'email' : 'telefono');

      return {
        nombre,
        lugar,
        telefono,
        email,
        canal_preferido: normalizeChannel(row?.canal_preferido, fallbackChannel),
        principal: asBool(row?.principal),
        activo: row?.activo === undefined ? true : asBool(row?.activo),
        notas,
        orden: index
      };
    })
    .filter(Boolean);

  if (contacts.length > 0 && !contacts.some((item) => item.principal)) {
    contacts[0].principal = true;
  }

  return contacts;
}

function buildCompanyContacts(body = {}) {
  const contacts = parseContactRows(body.contactos);
  if (contacts.length > 0) {
    return contacts;
  }

  const legacyNombre = asNullableText(body.contacto_nombre);
  const legacyTelefono = asNullableText(body.telefono);
  const legacyEmail = asNullableText(body.email);

  if (!legacyNombre && !legacyTelefono && !legacyEmail) {
    return [];
  }

  return [{
    nombre: legacyNombre,
    lugar: null,
    telefono: legacyTelefono,
    email: legacyEmail,
    canal_preferido: legacyTelefono ? 'whatsapp' : (legacyEmail ? 'email' : 'telefono'),
    principal: true,
    activo: true,
    notas: null,
    orden: 0
  }];
}

async function replaceCompanyContacts(dbClient, clienteId, contactos) {
  await dbClient.query('DELETE FROM cliente_contactos WHERE cliente_id = $1', [clienteId]);

  for (const contacto of contactos) {
    await dbClient.query(`
      INSERT INTO cliente_contactos (
        cliente_id, nombre, lugar, telefono, email, canal_preferido, principal, activo, notas, orden
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      clienteId,
      contacto.nombre,
      contacto.lugar,
      contacto.telefono,
      contacto.email,
      contacto.canal_preferido,
      contacto.principal,
      contacto.activo,
      contacto.notas,
      contacto.orden
    ]);
  }
}

function buildUserDefaults(usuario = {}) {
  return {
    ...usuario,
    activo: usuario.activo !== false,
    notif_email: usuario.notif_email !== false,
    notif_pantalla: usuario.notif_pantalla !== false,
    notif_nuevo_ticket: usuario.notif_nuevo_ticket !== false,
    notif_cambio_estado: usuario.notif_cambio_estado !== false,
    notif_nuevo_comentario: usuario.notif_nuevo_comentario !== false,
    notif_asignacion: usuario.notif_asignacion !== false
  };
}

async function renderDashboard(req, res) {
  const [usersRes, statsRes, clientsRes] = await Promise.all([
    pool.query(`
      SELECT
        u.*,
        c.nombre AS cliente_nombre,
        cm.email_notif,
        cm.notif_nuevo_ticket,
        cm.notif_cambio_estado,
        cm.notif_nuevo_comentario,
        cm.notif_asignacion,
        (SELECT COUNT(*) FROM tickets WHERE ejecutor_id = u.id) AS total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE ejecutor_id = u.id AND estado = 'Pendiente') AS pendientes
      FROM usuarios u
      LEFT JOIN clientes c ON c.id = u.cliente_id
      LEFT JOIN config_mail cm ON cm.usuario_id = u.id
      ORDER BY u.created_at DESC
    `),
    pool.query(`
      SELECT
        COUNT(*) as total_tickets,
        COUNT(*) FILTER (WHERE estado = 'Pendiente') as pendientes,
        COUNT(*) FILTER (WHERE estado = 'En Proceso') as en_proceso,
        COUNT(*) FILTER (WHERE estado = 'Resuelto') as resueltos,
        COUNT(*) FILTER (WHERE prioridad = 'Alta' OR prioridad = 'Urgente') as alta_prioridad,
        COUNT(DISTINCT cliente_id) as clientes_activos
      FROM tickets
    `),
    pool.query(`
      SELECT
        c.id,
        c.nombre,
        c.email,
        c.contacto_nombre,
        c.telefono,
        (
          SELECT COUNT(*)
          FROM cliente_contactos cc
          WHERE cc.cliente_id = c.id AND cc.activo = true
        ) AS total_contactos
      FROM clientes c
      ORDER BY c.created_at DESC
      LIMIT 5
    `)
  ]);

  res.render('admin/index', {
    title: 'Administracion',
    usuarios: usersRes.rows,
    stats: statsRes.rows[0],
    clientesRecientes: clientsRes.rows
  });
}

router.get('/', requireLogin, requireAdmin, renderDashboard);

router.get('/usuarios/nuevo', requireLogin, requireAdmin, async (_req, res) => {
  const clientesRes = await pool.query('SELECT id, nombre FROM clientes ORDER BY nombre');

  res.render('admin/usuario-form', {
    title: 'Nuevo Usuario',
    usuario: buildUserDefaults({}),
    clientes: clientesRes.rows,
    accion: 'nuevo'
  });
});

router.post('/usuarios/nuevo', requireLogin, requireAdmin, async (req, res) => {
  const {
    nombre,
    email,
    password,
    rol,
    cliente_id,
    email_notif,
    notif_nuevo_ticket,
    notif_cambio_estado,
    notif_nuevo_comentario,
    notif_asignacion,
    notif_pantalla,
    notif_email
  } = req.body;

  const client = await pool.connect();
  try {
    const finalRol = normalizeRole(rol) || rol;

    if (finalRol === 'cliente' && !cliente_id) {
      throw new Error('Debes asociar una empresa para usuarios cliente');
    }

    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, 10);
    const result = await client.query(`
      INSERT INTO usuarios (nombre, email, password, rol, cliente_id, activo, notif_email, notif_pantalla)
      VALUES ($1, $2, $3, $4, $5, true, $6, $7)
      RETURNING id
    `, [nombre, email, hash, finalRol, finalRol === 'cliente' ? asNullableInt(cliente_id) : null, asBool(notif_email), asBool(notif_pantalla)]);

    await client.query(`
      INSERT INTO config_mail (
        usuario_id, email_notif, notif_nuevo_ticket, notif_cambio_estado, notif_nuevo_comentario, notif_asignacion
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      result.rows[0].id,
      email_notif || email,
      asBool(notif_nuevo_ticket),
      asBool(notif_cambio_estado),
      asBool(notif_nuevo_comentario),
      asBool(notif_asignacion)
    ]);

    await client.query('COMMIT');
    req.flash('success', 'Usuario creado correctamente');
    res.redirect('/admin');
  } catch (error) {
    await client.query('ROLLBACK');
    req.flash('error', `Error creando usuario: ${error.message}`);
    res.redirect('/admin/usuarios/nuevo');
  } finally {
    client.release();
  }
});

router.get('/usuarios/:id/editar', requireLogin, requireAdmin, async (req, res) => {
  const [result, clientesRes] = await Promise.all([
    pool.query(`
    SELECT
      u.*,
      cm.email_notif,
      cm.notif_nuevo_ticket,
      cm.notif_cambio_estado,
      cm.notif_nuevo_comentario,
      cm.notif_asignacion
    FROM usuarios u
    LEFT JOIN config_mail cm ON cm.usuario_id = u.id
    WHERE u.id = $1
    `, [req.params.id]),
    pool.query('SELECT id, nombre FROM clientes ORDER BY nombre')
  ]);

  if (!result.rows[0]) {
    req.flash('error', 'Usuario no encontrado');
    return res.redirect('/admin');
  }

  res.render('admin/usuario-form', {
    title: 'Editar Usuario',
    usuario: buildUserDefaults(result.rows[0]),
    clientes: clientesRes.rows,
    accion: 'editar'
  });
});

router.post('/usuarios/:id/editar', requireLogin, requireAdmin, async (req, res) => {
  const {
    nombre,
    email,
    password,
    rol,
    cliente_id,
    activo,
    email_notif,
    notif_nuevo_ticket,
    notif_cambio_estado,
    notif_nuevo_comentario,
    notif_asignacion,
    notif_pantalla,
    notif_email
  } = req.body;

  const client = await pool.connect();
  try {
    const finalRol = normalizeRole(rol) || rol;

    if (finalRol === 'cliente' && !cliente_id) {
      throw new Error('Debes asociar una empresa para usuarios cliente');
    }

    await client.query('BEGIN');

    const values = [nombre, email, finalRol, finalRol === 'cliente' ? asNullableInt(cliente_id) : null, asBool(activo), asBool(notif_email), asBool(notif_pantalla), req.params.id];
    let updateSql = `
      UPDATE usuarios
      SET nombre = $1, email = $2, rol = $3, cliente_id = $4, activo = $5, notif_email = $6, notif_pantalla = $7
    `;

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      values.splice(7, 0, hash);
      updateSql += ', password = $8 WHERE id = $9';
    } else {
      updateSql += ' WHERE id = $8';
    }

    await client.query(updateSql, values);

    await client.query(`
      INSERT INTO config_mail (
        usuario_id, email_notif, notif_nuevo_ticket, notif_cambio_estado, notif_nuevo_comentario, notif_asignacion
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (usuario_id) DO UPDATE SET
        email_notif = EXCLUDED.email_notif,
        notif_nuevo_ticket = EXCLUDED.notif_nuevo_ticket,
        notif_cambio_estado = EXCLUDED.notif_cambio_estado,
        notif_nuevo_comentario = EXCLUDED.notif_nuevo_comentario,
        notif_asignacion = EXCLUDED.notif_asignacion,
        updated_at = NOW()
    `, [
      req.params.id,
      email_notif || email,
      asBool(notif_nuevo_ticket),
      asBool(notif_cambio_estado),
      asBool(notif_nuevo_comentario),
      asBool(notif_asignacion)
    ]);

    await client.query('COMMIT');

    if (req.session.user && req.session.user.id === parseInt(req.params.id, 10)) {
      req.session.user.nombre = nombre;
      req.session.user.email = email;
      req.session.user.rol = finalRol;
      req.session.user.cliente_id = finalRol === 'cliente' ? asNullableInt(cliente_id) : null;
    }

    req.flash('success', 'Usuario actualizado correctamente');
    res.redirect('/admin');
  } catch (error) {
    await client.query('ROLLBACK');
    req.flash('error', `Error actualizando usuario: ${error.message}`);
    res.redirect(`/admin/usuarios/${req.params.id}/editar`);
  } finally {
    client.release();
  }
});

router.get('/clientes', requireLogin, requireAdmin, async (_req, res) => {
  const result = await pool.query(`
    SELECT
      c.*,
      (
        SELECT COUNT(*)
        FROM tickets t
        WHERE t.cliente_id = c.id
      ) AS total_tickets,
      (
        SELECT COUNT(*)
        FROM cliente_contactos cc
        WHERE cc.cliente_id = c.id AND cc.activo = true
      ) AS total_contactos
    FROM clientes c
    ORDER BY c.nombre ASC
  `);

  res.render('admin/clientes', {
    title: 'Empresas',
    clientes: result.rows
  });
});

router.get('/clientes/nuevo', requireLogin, requireAdmin, (_req, res) => {
  res.render('admin/cliente-form', {
    title: 'Nueva Empresa',
    cliente: {},
    contactos: [],
    accion: 'nuevo'
  });
});

router.post('/clientes/nuevo', requireLogin, requireAdmin, async (req, res) => {
  const {
    codigo_externo,
    nombre,
    tipo_cliente,
    nombre_tipo,
    contacto_nombre,
    telefono,
    email,
    notas
  } = req.body;

  const client = await pool.connect();
  try {
    const contactos = buildCompanyContacts(req.body);
    const principal = contactos.find((item) => item.principal) || contactos[0] || null;

    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO clientes (
        codigo_externo, nombre, tipo_cliente, nombre_tipo, contacto_nombre, telefono, email, notas
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      asNullableInt(codigo_externo),
      nombre,
      asNullableInt(tipo_cliente),
      asNullableText(nombre_tipo),
      asNullableText(contacto_nombre) || principal?.nombre || null,
      asNullableText(telefono) || principal?.telefono || null,
      asNullableText(email) || principal?.email || null,
      asNullableText(notas)
    ]);

    await replaceCompanyContacts(client, result.rows[0].id, contactos);
    await client.query('COMMIT');

    req.flash('success', 'Empresa creada correctamente');
    res.redirect('/admin/clientes');
  } catch (error) {
    await client.query('ROLLBACK');
    req.flash('error', `Error creando empresa: ${error.message}`);
    res.redirect('/admin/clientes/nuevo');
  } finally {
    client.release();
  }
});

router.get('/clientes/:id/editar', requireLogin, requireAdmin, async (req, res) => {
  const [result, contactsRes] = await Promise.all([
    pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]),
    pool.query(`
      SELECT *
      FROM cliente_contactos
      WHERE cliente_id = $1
      ORDER BY principal DESC, orden ASC, id ASC
    `, [req.params.id])
  ]);

  if (!result.rows[0]) {
    req.flash('error', 'Empresa no encontrada');
    return res.redirect('/admin/clientes');
  }

  res.render('admin/cliente-form', {
    title: 'Editar Empresa',
    cliente: result.rows[0],
    contactos: contactsRes.rows,
    accion: 'editar'
  });
});

router.post('/clientes/:id/editar', requireLogin, requireAdmin, async (req, res) => {
  const {
    codigo_externo,
    nombre,
    tipo_cliente,
    nombre_tipo,
    contacto_nombre,
    telefono,
    email,
    notas
  } = req.body;

  const client = await pool.connect();
  try {
    const contactos = buildCompanyContacts(req.body);
    const principal = contactos.find((item) => item.principal) || contactos[0] || null;

    await client.query('BEGIN');
    await client.query(`
      UPDATE clientes
      SET
        codigo_externo = $1,
        nombre = $2,
        tipo_cliente = $3,
        nombre_tipo = $4,
        contacto_nombre = $5,
        telefono = $6,
        email = $7,
        notas = $8
      WHERE id = $9
    `, [
      asNullableInt(codigo_externo),
      nombre,
      asNullableInt(tipo_cliente),
      asNullableText(nombre_tipo),
      asNullableText(contacto_nombre) || principal?.nombre || null,
      asNullableText(telefono) || principal?.telefono || null,
      asNullableText(email) || principal?.email || null,
      asNullableText(notas),
      req.params.id
    ]);

    await replaceCompanyContacts(client, req.params.id, contactos);
    await client.query('COMMIT');

    req.flash('success', 'Empresa actualizada correctamente');
    res.redirect('/admin/clientes');
  } catch (error) {
    await client.query('ROLLBACK');
    req.flash('error', `Error actualizando empresa: ${error.message}`);
    res.redirect(`/admin/clientes/${req.params.id}/editar`);
  } finally {
    client.release();
  }
});

router.get('/notificaciones', requireLogin, async (req, res) => {
  const [configRes, userRes] = await Promise.all([
    pool.query('SELECT * FROM config_mail WHERE usuario_id = $1', [req.session.user.id]),
    pool.query('SELECT * FROM usuarios WHERE id = $1', [req.session.user.id])
  ]);

  res.render('admin/notificaciones', {
    title: 'Mis Notificaciones',
    config: buildUserDefaults(configRes.rows[0] || {}),
    usuario: buildUserDefaults(userRes.rows[0] || {})
  });
});

router.post('/notificaciones', requireLogin, async (req, res) => {
  const {
    email_notif,
    notif_nuevo_ticket,
    notif_cambio_estado,
    notif_nuevo_comentario,
    notif_asignacion,
    notif_pantalla,
    notif_email
  } = req.body;

  try {
    await pool.query(`
      INSERT INTO config_mail (
        usuario_id, email_notif, notif_nuevo_ticket, notif_cambio_estado, notif_nuevo_comentario, notif_asignacion
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (usuario_id) DO UPDATE SET
        email_notif = EXCLUDED.email_notif,
        notif_nuevo_ticket = EXCLUDED.notif_nuevo_ticket,
        notif_cambio_estado = EXCLUDED.notif_cambio_estado,
        notif_nuevo_comentario = EXCLUDED.notif_nuevo_comentario,
        notif_asignacion = EXCLUDED.notif_asignacion,
        updated_at = NOW()
    `, [
      req.session.user.id,
      email_notif,
      asBool(notif_nuevo_ticket),
      asBool(notif_cambio_estado),
      asBool(notif_nuevo_comentario),
      asBool(notif_asignacion)
    ]);

    await pool.query(`
      UPDATE usuarios
      SET notif_pantalla = $1, notif_email = $2
      WHERE id = $3
    `, [asBool(notif_pantalla), asBool(notif_email), req.session.user.id]);

    req.flash('success', 'Configuracion guardada');
    res.redirect('/admin/notificaciones');
  } catch (error) {
    req.flash('error', `Error guardando configuracion: ${error.message}`);
    res.redirect('/admin/notificaciones');
  }
});

module.exports = router;
