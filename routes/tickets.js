const path = require('path');
const express = require('express');
const router = express.Router();
const moment = require('moment');
const { pool } = require('../config/db');
const {
  requireLogin,
  isClient,
  canAccessDevelopment,
  canManageAssignments,
  normalizeRole
} = require('../middleware/auth');
const { uploadTicketImages } = require('../config/uploads');
const { enviarReporteTicket, enviarConfirmacionCreadorTicket, notificarTicket } = require('../config/mailer');
const { buildDevAssistant } = require('../services/dev-radar');

function withImageUpload(fieldName, fallbackPath) {
  return (req, res, next) => {
    uploadTicketImages.array(fieldName, 8)(req, res, (error) => {
      if (!error) {
        next();
        return;
      }

      req.flash('error', error.message);
      res.redirect(typeof fallbackPath === 'function' ? fallbackPath(req) : fallbackPath);
    });
  };
}

function buildAttachmentRows(ticketId, files, comentarioId = null) {
  return (files || []).map((file) => ({
    ticketId,
    comentarioId,
    nombreOriginal: file.originalname,
    nombreArchivo: path.basename(file.filename),
    ruta: `/uploads/tickets/${path.basename(file.filename)}`,
    mimeType: file.mimetype,
    tamanio: file.size
  }));
}

async function saveAttachments(client, attachments) {
  for (const attachment of attachments) {
    await client.query(`
      INSERT INTO ticket_adjuntos (
        ticket_id, comentario_id, nombre_original, nombre_archivo, ruta, mime_type, tamanio
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      attachment.ticketId,
      attachment.comentarioId,
      attachment.nombreOriginal,
      attachment.nombreArchivo,
      attachment.ruta,
      attachment.mimeType,
      attachment.tamanio
    ]);
  }
}

async function refreshAttachmentCount(client, ticketId) {
  await client.query(`
    UPDATE tickets
    SET cant_archivos = (
      SELECT COUNT(*)
      FROM ticket_adjuntos
      WHERE ticket_id = $1
    )
    WHERE id = $1
  `, [ticketId]);
}

function groupAttachmentsByComment(attachments) {
  return attachments.reduce((acc, attachment) => {
    if (!attachment.comentario_id) {
      return acc;
    }

    if (!acc[attachment.comentario_id]) {
      acc[attachment.comentario_id] = [];
    }

    acc[attachment.comentario_id].push(attachment);
    return acc;
  }, {});
}

async function findDefaultInternalUser(client) {
  const result = await client.query(`
    SELECT id
    FROM usuarios
    WHERE activo = true
      AND rol IN ('tecnico_soporte', 'soporte', 'admin_soporte', 'admin', 'tecnico_desarrollo', 'desarrollo', 'admin_desarrollo')
    ORDER BY CASE
      WHEN rol IN ('tecnico_soporte', 'soporte') THEN 1
      WHEN rol IN ('admin_soporte') THEN 2
      WHEN rol IN ('admin') THEN 3
      WHEN rol IN ('tecnico_desarrollo', 'desarrollo') THEN 4
      ELSE 5
    END, id
    LIMIT 1
  `);

  return result.rows[0]?.id || null;
}

router.get('/', requireLogin, async (req, res) => {
  const { estado, prioridad, canal, buscar, page = 1 } = req.query;
  const limit = 15;
  const offset = (page - 1) * limit;
  const user = req.session.user;

  let whereClause = '1=1';
  let statsWhereClause = '1=1';
  const params = [];
  const statsParams = [];
  let pIdx = 1;
  let statsIdx = 1;

  if (isClient(user)) {
    if (user.cliente_id) {
      whereClause += ` AND t.cliente_id = $${pIdx}`;
      params.push(user.cliente_id);
      pIdx++;

      statsWhereClause += ` AND t.cliente_id = $${statsIdx}`;
      statsParams.push(user.cliente_id);
      statsIdx++;
    } else {
      whereClause += ' AND 1=0';
      statsWhereClause += ' AND 1=0';
    }
  }

  if (normalizeRole(user.rol) === 'tecnico_desarrollo') {
    whereClause += ` AND (t.ejecutor_id = $${pIdx} OR t.receptor_id = $${pIdx})`;
    params.push(user.id);
    pIdx++;
  }

  if (normalizeRole(user.rol) === 'tecnico_soporte') {
    whereClause += ` AND (t.ejecutor_id = $${pIdx} OR t.receptor_id = $${pIdx})`;
    params.push(user.id);
    pIdx++;
  }

  if (estado) {
    whereClause += ` AND t.estado = $${pIdx}`;
    params.push(estado);
    pIdx++;
  }

  if (prioridad) {
    whereClause += ` AND t.prioridad = $${pIdx}`;
    params.push(prioridad);
    pIdx++;
  }

  if (canal) {
    whereClause += ` AND COALESCE(t.canal_origen, 'web') = $${pIdx}`;
    params.push(canal);
    pIdx++;
  }

  if (buscar) {
    whereClause += ` AND (
      t.reclamo ILIKE $${pIdx}
      OR t.asunto ILIKE $${pIdx}
      OR t.origen_email ILIKE $${pIdx}
      OR t.origen_telefono ILIKE $${pIdx}
      OR t.referencia_externa ILIKE $${pIdx}
      OR c.nombre ILIKE $${pIdx}
      OR c.email ILIKE $${pIdx}
      OR c.telefono ILIKE $${pIdx}
      OR t.nro_ticket::text LIKE $${pIdx}
    )`;
    params.push(`%${buscar}%`);
    pIdx++;
  }

  try {
    const [ticketsRes, countRes, statsRes, notifRes] = await Promise.all([
      pool.query(`
        SELECT
          t.*,
          c.nombre AS cliente_nombre,
          u1.nombre AS receptor_nombre,
          u2.nombre AS ejecutor_nombre
        FROM tickets t
        LEFT JOIN clientes c ON t.cliente_id = c.id
        LEFT JOIN usuarios u1 ON t.receptor_id = u1.id
        LEFT JOIN usuarios u2 ON t.ejecutor_id = u2.id
        WHERE ${whereClause}
        ORDER BY
          CASE t.prioridad WHEN 'Urgente' THEN 1 WHEN 'Alta' THEN 2 WHEN 'Media' THEN 3 ELSE 4 END,
          t.fecha_creacion DESC
        LIMIT $${pIdx} OFFSET $${pIdx + 1}
      `, [...params, limit, offset]),
      pool.query(`
        SELECT COUNT(*)
        FROM tickets t
        LEFT JOIN clientes c ON t.cliente_id = c.id
        WHERE ${whereClause}
      `, params),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE estado = 'Pendiente') AS pendiente,
          COUNT(*) FILTER (WHERE estado = 'En Proceso') AS en_proceso,
          COUNT(*) FILTER (WHERE estado = 'Resuelto') AS resuelto,
          COUNT(*) FILTER (WHERE estado = 'Cerrado') AS cerrado,
          COUNT(*) FILTER (WHERE prioridad = 'Alta' OR prioridad = 'Urgente') AS alta_prioridad,
          COUNT(*) FILTER (WHERE dias_transcurridos > 30) AS vencidos
        FROM tickets t
        WHERE ${statsWhereClause}
      `, statsParams),
      pool.query(`
        SELECT id, mensaje, tipo, created_at, ticket_id
        FROM notificaciones
        WHERE usuario_id = $1 AND leida = false
        ORDER BY created_at DESC
        LIMIT 10
      `, [user.id])
    ]);

    const totalPages = Math.ceil(parseInt(countRes.rows[0].count, 10) / limit);

    res.render('tickets/index', {
      title: 'Tickets',
      tickets: ticketsRes.rows,
      stats: statsRes.rows[0],
      notificaciones: notifRes.rows,
      pagination: {
        current: parseInt(page, 10),
        total: totalPages,
        count: parseInt(countRes.rows[0].count, 10)
      },
      filters: { estado, prioridad, canal, buscar },
      moment
    });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Error cargando tickets');
    res.redirect('/');
  }
});

router.get('/nuevo', requireLogin, async (req, res) => {
  const user = req.session.user;
  const [clientesRes, usuariosRes] = await Promise.all([
    isClient(user)
      ? pool.query('SELECT * FROM clientes WHERE id = $1', [user.cliente_id || 0])
      : pool.query('SELECT * FROM clientes ORDER BY nombre'),
    pool.query(`
      SELECT id, nombre, rol
      FROM usuarios
      WHERE activo = true
        AND rol IN ('admin', 'admin_soporte', 'admin_desarrollo', 'tecnico_soporte', 'soporte', 'tecnico_desarrollo', 'desarrollo')
      ORDER BY nombre
    `)
  ]);

  res.render('tickets/nuevo', {
    title: 'Nuevo Ticket',
    clientes: clientesRes.rows,
    usuarios: usuariosRes.rows,
    ticket: {}
  });
});

router.post('/nuevo', requireLogin, withImageUpload('imagenes', '/tickets/nuevo'), async (req, res) => {
  const {
    cliente_id,
    reclamo,
    observacion,
    asunto,
    prioridad,
    estado,
    canal_origen,
    origen_email,
    origen_telefono,
    referencia_externa,
    proceso,
    receptor_id,
    ejecutor_id,
    notificar_creador_mail,
    creado_desde_mobile
  } = req.body;
  const user = req.session.user;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const isClientUser = isClient(user);
    const finalClienteId = isClientUser ? user.cliente_id : cliente_id;
    if (!finalClienteId) {
      throw new Error('No hay empresa asociada para crear el ticket');
    }

    const defaultInternalUserId = isClientUser ? await findDefaultInternalUser(client) : null;
    const finalReceptorId = isClientUser ? defaultInternalUserId : (receptor_id || user.id);
    const finalEjecutorId = isClientUser ? defaultInternalUserId : (ejecutor_id || user.id);
    const finalEstado = isClientUser ? 'Pendiente' : (estado || 'Pendiente');
    const finalBolsa = isClientUser ? 'soporte' : (req.body.bolsa_asignada || 'soporte');
    const finalPrioridad = prioridad || 'Media';
    const finalCanalOrigen = isClientUser ? 'web' : (canal_origen || 'web');
    const finalOrigenEmail = origen_email || (isClientUser ? user.email : null);

    const maxRes = await client.query('SELECT COALESCE(MAX(nro_ticket), 90000) + 1 AS next FROM tickets');
    const nroTicket = maxRes.rows[0].next;

    const result = await client.query(`
      INSERT INTO tickets (
        nro_ticket, cliente_id, reclamo, observacion, asunto, prioridad, estado,
        canal_origen, origen_email, origen_telefono, referencia_externa, proceso, bolsa_asignada,
        receptor_id, ejecutor_id, fecha_creacion, fecha_asignacion
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
      RETURNING id
    `, [
      nroTicket,
      finalClienteId,
      reclamo,
      observacion || '',
      asunto || null,
      finalPrioridad,
      finalEstado,
      finalCanalOrigen,
      finalOrigenEmail || null,
      origen_telefono || null,
      referencia_externa || null,
      proceso || null,
      finalBolsa,
      finalReceptorId,
      finalEjecutorId
    ]);

    const ticketId = result.rows[0].id;
    const attachments = buildAttachmentRows(ticketId, req.files);
    await saveAttachments(client, attachments);
    await refreshAttachmentCount(client, ticketId);

    await client.query(`
      INSERT INTO comentarios (ticket_id, usuario_id, comentario, tipo, visible_cliente)
      VALUES ($1, $2, $3, 'cambio_estado', $4)
    `, [ticketId, user.id, `Ticket creado con estado: ${finalEstado}`, isClientUser]);

    await client.query('COMMIT');

    await notificarTicket({
      ticketId,
      tipo: 'nuevo',
      mensaje: `Nuevo ticket #${nroTicket} asignado`,
      usuarioOrigenId: user.id
    });

    if (notificar_creador_mail === 'on' || isClientUser) {
      try {
        await enviarConfirmacionCreadorTicket({
          ticketId,
          to: user.email,
          nombre: user.nombre
        });
      } catch (error) {
        console.error('Error enviando confirmacion al creador:', error.message);
      }
    }

    if (creado_desde_mobile === '1') {
      try {
        await pool.query(`
          INSERT INTO notificaciones (usuario_id, ticket_id, mensaje, tipo)
          VALUES ($1, $2, $3, 'success')
        `, [user.id, ticketId, `Ticket #${nroTicket} creado desde el telefono`]);
      } catch (error) {
        console.error('Error creando notificacion mobile:', error.message);
      }
    }

    req.flash('success', `Ticket #${nroTicket} creado correctamente`);
    res.redirect(`/tickets/${ticketId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    req.flash('error', `Error al crear ticket: ${error.message}`);
    res.redirect('/tickets/nuevo');
  } finally {
    client.release();
  }
});

router.get('/mail-intake', requireLogin, (_req, res) => {
  if (isClient(_req.session.user)) {
    _req.flash('error', 'Acceso restringido');
    return res.redirect('/tickets');
  }

  res.render('tickets/mail-intake', {
    title: 'Intake Mail'
  });
});

router.get('/:id', requireLogin, async (req, res) => {
  try {
    const ticketWhere = isClient(req.session.user)
      ? 't.id = $1 AND t.cliente_id = $2'
      : 't.id = $1';
    const ticketParams = isClient(req.session.user)
      ? [req.params.id, req.session.user.cliente_id || 0]
      : [req.params.id];

    const [ticketRes, comentariosRes, usuariosRes, notifRes, adjuntosRes] = await Promise.all([
      pool.query(`
        SELECT
          t.*,
          c.nombre AS cliente_nombre,
          c.email AS cliente_email,
          c.telefono AS cliente_telefono,
          c.contacto_nombre AS cliente_contacto,
          c.notas AS cliente_notas,
          u1.nombre AS receptor_nombre,
          u2.nombre AS ejecutor_nombre
        FROM tickets t
        LEFT JOIN clientes c ON t.cliente_id = c.id
        LEFT JOIN usuarios u1 ON t.receptor_id = u1.id
        LEFT JOIN usuarios u2 ON t.ejecutor_id = u2.id
        WHERE ${ticketWhere}
      `, ticketParams),
      pool.query(`
        SELECT cm.*, u.nombre AS usuario_nombre, u.rol
        FROM comentarios cm
        LEFT JOIN usuarios u ON cm.usuario_id = u.id
        WHERE cm.ticket_id = $1
          AND ($2::boolean = false OR cm.visible_cliente = true)
        ORDER BY cm.created_at ASC
      `, [req.params.id, isClient(req.session.user)]),
      pool.query(`
        SELECT
          u.id,
          u.nombre,
          u.rol,
          (
            SELECT COUNT(*)
            FROM tickets t2
            WHERE t2.cliente_id = (SELECT cliente_id FROM tickets WHERE id = $1)
              AND (t2.receptor_id = u.id OR t2.ejecutor_id = u.id)
              AND t2.estado IN ('Pendiente', 'En Proceso')
          ) AS tickets_misma_empresa
        FROM usuarios u
        WHERE u.activo = true
          AND u.rol IN ('admin', 'admin_soporte', 'admin_desarrollo', 'tecnico_soporte', 'soporte', 'tecnico_desarrollo', 'desarrollo')
        ORDER BY tickets_misma_empresa DESC, u.nombre
      `, [req.params.id]),
      pool.query('SELECT COUNT(*) AS unread FROM notificaciones WHERE usuario_id = $1 AND leida = false', [req.session.user.id]),
      pool.query(`
        SELECT *
        FROM ticket_adjuntos
        WHERE ticket_id = $1
        ORDER BY created_at ASC
      `, [req.params.id])
    ]);

    if (!ticketRes.rows[0]) {
      req.flash('error', 'Ticket no encontrado');
      return res.redirect('/tickets');
    }

    const attachments = adjuntosRes.rows;
    const attachmentsByComment = groupAttachmentsByComment(attachments);
    const ticketAttachments = attachments.filter((attachment) => !attachment.comentario_id);
    const devAssistant = canAccessDevelopment(req.session.user)
      ? await buildDevAssistant(ticketRes.rows[0])
      : null;

    res.render('tickets/ver', {
      title: `Ticket #${ticketRes.rows[0].nro_ticket}`,
      ticket: ticketRes.rows[0],
      comentarios: comentariosRes.rows,
      usuarios: usuariosRes.rows,
      attachments: ticketAttachments,
      attachmentsByComment,
      devAssistant,
      canReassign: canManageAssignments(req.session.user),
      unreadCount: parseInt(notifRes.rows[0].unread, 10),
      defaultReportMessage: [
        `Te compartimos el estado del ticket #${ticketRes.rows[0].nro_ticket}.`,
        '',
        'Resumen:',
        `- Estado actual: ${ticketRes.rows[0].estado}`,
        `- Prioridad: ${ticketRes.rows[0].prioridad}`,
        '',
        'Quedamos atentos a cualquier comentario adicional.'
      ].join('\n'),
      moment
    });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Error al cargar ticket');
    res.redirect('/tickets');
  }
});

router.post('/:id/estado', requireLogin, async (req, res) => {
  const { estado, comentario, visible_cliente } = req.body;
  const user = req.session.user;

  try {
    if (isClient(user)) {
      req.flash('error', 'Los usuarios cliente no pueden cambiar el estado');
      return res.redirect(`/tickets/${req.params.id}`);
    }

    const oldRes = await pool.query('SELECT estado, nro_ticket FROM tickets WHERE id = $1', [req.params.id]);
    const old = oldRes.rows[0];

    if (!old) {
      req.flash('error', 'Ticket no encontrado');
      return res.redirect('/tickets');
    }

    const updates = ['estado = $1', 'updated_at = NOW()'];
    const values = [estado];

    if (estado === 'Resuelto') {
      updates.push('fecha_resolucion = COALESCE(fecha_resolucion, NOW())');
    }

    values.push(req.params.id);
    await pool.query(`UPDATE tickets SET ${updates.join(', ')} WHERE id = $${values.length}`, values);

    const msg = comentario || `Estado cambiado de "${old.estado}" a "${estado}"`;
    await pool.query(`
      INSERT INTO comentarios (ticket_id, usuario_id, comentario, tipo, visible_cliente)
      VALUES ($1, $2, $3, 'cambio_estado', $4)
    `, [req.params.id, user.id, msg, visible_cliente === 'on']);

    await notificarTicket({
      ticketId: parseInt(req.params.id, 10),
      tipo: 'cambio_estado',
      mensaje: `Ticket #${old.nro_ticket}: ${msg}`,
      usuarioOrigenId: user.id
    });

    req.flash('success', 'Estado actualizado');
    res.redirect(`/tickets/${req.params.id}`);
  } catch (error) {
    console.error(error);
    req.flash('error', 'Error al actualizar estado');
    res.redirect(`/tickets/${req.params.id}`);
  }
});

router.post('/:id/comentar', requireLogin, withImageUpload('imagenes', (req) => `/tickets/${req.params.id}`), async (req, res) => {
  const { comentario, visible_cliente } = req.body;
  const user = req.session.user;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const ticketWhere = isClient(user)
      ? 'id = $1 AND cliente_id = $2'
      : 'id = $1';
    const ticketParams = isClient(user)
      ? [req.params.id, user.cliente_id || 0]
      : [req.params.id];
    const tkRes = await client.query(`SELECT nro_ticket FROM tickets WHERE ${ticketWhere}`, ticketParams);
    if (!tkRes.rows[0]) {
      throw new Error('Ticket no encontrado');
    }

    const commentRes = await client.query(`
      INSERT INTO comentarios (ticket_id, usuario_id, comentario, tipo, visible_cliente)
      VALUES ($1, $2, $3, 'comentario', $4)
      RETURNING id
    `, [req.params.id, user.id, comentario, isClient(user) ? true : visible_cliente === 'on']);

    const attachments = buildAttachmentRows(req.params.id, req.files, commentRes.rows[0].id);
    await saveAttachments(client, attachments);
    await refreshAttachmentCount(client, req.params.id);

    await client.query('COMMIT');

    await notificarTicket({
      ticketId: parseInt(req.params.id, 10),
      tipo: 'comentario',
      mensaje: `Nuevo comentario en ticket #${tkRes.rows[0].nro_ticket} por ${user.nombre}`,
      usuarioOrigenId: user.id
    });

    req.flash('success', 'Comentario agregado');
    res.redirect(`/tickets/${req.params.id}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    req.flash('error', `Error al comentar: ${error.message}`);
    res.redirect(`/tickets/${req.params.id}`);
  } finally {
    client.release();
  }
});

router.post('/:id/asignar', requireLogin, async (req, res) => {
  const { ejecutor_id, receptor_id, bolsa_asignada } = req.body;
  const user = req.session.user;

  try {
    if (isClient(user)) {
      req.flash('error', 'Los usuarios cliente no pueden reasignar tickets');
      return res.redirect(`/tickets/${req.params.id}`);
    }

    if (!canManageAssignments(user)) {
      req.flash('error', 'Solo los administradores de soporte o desarrollo pueden reasignar tickets');
      return res.redirect(`/tickets/${req.params.id}`);
    }

    await pool.query(`
      UPDATE tickets
      SET ejecutor_id = $1, receptor_id = $2, bolsa_asignada = $3, updated_at = NOW()
      WHERE id = $4
    `, [ejecutor_id, receptor_id, bolsa_asignada || 'soporte', req.params.id]);

    const tkRes = await pool.query('SELECT nro_ticket FROM tickets WHERE id = $1', [req.params.id]);
    await pool.query(`
      INSERT INTO comentarios (ticket_id, usuario_id, comentario, tipo, visible_cliente)
      VALUES ($1, $2, $3, 'asignacion', false)
    `, [req.params.id, user.id, `Ticket reasignado. Bolsa: ${bolsa_asignada || 'soporte'}`]);

    await notificarTicket({
      ticketId: parseInt(req.params.id, 10),
      tipo: 'asignacion',
      mensaje: `Ticket #${tkRes.rows[0]?.nro_ticket} reasignado`,
      usuarioOrigenId: user.id
    });

    req.flash('success', 'Ticket reasignado');
    res.redirect(`/tickets/${req.params.id}`);
  } catch (error) {
    console.error(error);
    req.flash('error', 'Error al reasignar');
    res.redirect(`/tickets/${req.params.id}`);
  }
});

router.post('/:id/enviar-reporte', requireLogin, async (req, res) => {
  const { destinatario, asunto, mensaje, incluir_adjuntos } = req.body;
  const user = req.session.user;

  try {
    if (isClient(user)) {
      req.flash('error', 'Los usuarios cliente no pueden enviar reportes internos');
      return res.redirect(`/tickets/${req.params.id}`);
    }

    if (!destinatario || !mensaje) {
      throw new Error('Debes completar destinatario y mensaje');
    }

    await enviarReporteTicket({
      ticketId: parseInt(req.params.id, 10),
      to: destinatario,
      subject: asunto || `Reporte ticket #${req.params.id}`,
      message: mensaje,
      includeAttachments: incluir_adjuntos === 'on'
    });

    await pool.query(`
      INSERT INTO comentarios (ticket_id, usuario_id, comentario, tipo)
      VALUES ($1, $2, $3, 'comentario')
    `, [
      req.params.id,
      user.id,
      `Se envio un reporte por mail a ${destinatario}`
    ]);

    req.flash('success', 'Reporte enviado por mail');
    res.redirect(`/tickets/${req.params.id}`);
  } catch (error) {
    console.error(error);
    req.flash('error', `No se pudo enviar el reporte: ${error.message}`);
    res.redirect(`/tickets/${req.params.id}`);
  }
});

module.exports = router;
