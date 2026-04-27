const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

function asBool(value) {
  return value === 'on' || value === 'true' || value === true;
}

function asNullableInt(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return parseInt(value, 10);
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
        cm.email_notif,
        cm.notif_nuevo_ticket,
        cm.notif_cambio_estado,
        cm.notif_nuevo_comentario,
        cm.notif_asignacion,
        (SELECT COUNT(*) FROM tickets WHERE ejecutor_id = u.id) AS total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE ejecutor_id = u.id AND estado = 'Pendiente') AS pendientes
      FROM usuarios u
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
      SELECT id, nombre, email, contacto_nombre, telefono
      FROM clientes
      ORDER BY created_at DESC
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

router.get('/usuarios/nuevo', requireLogin, requireAdmin, (_req, res) => {
  res.render('admin/usuario-form', {
    title: 'Nuevo Usuario',
    usuario: buildUserDefaults({}),
    accion: 'nuevo'
  });
});

router.post('/usuarios/nuevo', requireLogin, requireAdmin, async (req, res) => {
  const {
    nombre,
    email,
    password,
    rol,
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
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, 10);
    const result = await client.query(`
      INSERT INTO usuarios (nombre, email, password, rol, activo, notif_email, notif_pantalla)
      VALUES ($1, $2, $3, $4, true, $5, $6)
      RETURNING id
    `, [nombre, email, hash, rol, asBool(notif_email), asBool(notif_pantalla)]);

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
  const result = await pool.query(`
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
  `, [req.params.id]);

  if (!result.rows[0]) {
    req.flash('error', 'Usuario no encontrado');
    return res.redirect('/admin');
  }

  res.render('admin/usuario-form', {
    title: 'Editar Usuario',
    usuario: buildUserDefaults(result.rows[0]),
    accion: 'editar'
  });
});

router.post('/usuarios/:id/editar', requireLogin, requireAdmin, async (req, res) => {
  const {
    nombre,
    email,
    password,
    rol,
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
    await client.query('BEGIN');

    const values = [nombre, email, rol, asBool(activo), asBool(notif_email), asBool(notif_pantalla), req.params.id];
    let updateSql = `
      UPDATE usuarios
      SET nombre = $1, email = $2, rol = $3, activo = $4, notif_email = $5, notif_pantalla = $6
    `;

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      values.splice(6, 0, hash);
      updateSql += ', password = $7 WHERE id = $8';
    } else {
      updateSql += ' WHERE id = $7';
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
      req.session.user.rol = rol;
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
      COUNT(t.id) AS total_tickets
    FROM clientes c
    LEFT JOIN tickets t ON t.cliente_id = c.id
    GROUP BY c.id
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

  try {
    await pool.query(`
      INSERT INTO clientes (
        codigo_externo, nombre, tipo_cliente, nombre_tipo, contacto_nombre, telefono, email, notas
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      asNullableInt(codigo_externo),
      nombre,
      asNullableInt(tipo_cliente),
      nombre_tipo || null,
      contacto_nombre || null,
      telefono || null,
      email || null,
      notas || null
    ]);

    req.flash('success', 'Empresa creada correctamente');
    res.redirect('/admin/clientes');
  } catch (error) {
    req.flash('error', `Error creando empresa: ${error.message}`);
    res.redirect('/admin/clientes/nuevo');
  }
});

router.get('/clientes/:id/editar', requireLogin, requireAdmin, async (req, res) => {
  const result = await pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) {
    req.flash('error', 'Empresa no encontrada');
    return res.redirect('/admin/clientes');
  }

  res.render('admin/cliente-form', {
    title: 'Editar Empresa',
    cliente: result.rows[0],
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

  try {
    await pool.query(`
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
      nombre_tipo || null,
      contacto_nombre || null,
      telefono || null,
      email || null,
      notas || null,
      req.params.id
    ]);

    req.flash('success', 'Empresa actualizada correctamente');
    res.redirect('/admin/clientes');
  } catch (error) {
    req.flash('error', `Error actualizando empresa: ${error.message}`);
    res.redirect(`/admin/clientes/${req.params.id}/editar`);
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
