const { pool } = require('../config/db');
const { notificarTicket } = require('../config/mailer');

const CHANNELS = new Set(['web', 'mail', 'whatsapp', 'vfp']);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function summarizeText(value, maxLength = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

async function findClientByOrigin({ email, phone, codigoExterno } = {}) {
  const cleanEmail = normalizeEmail(email);
  const cleanPhone = normalizePhone(phone);

  if (codigoExterno) {
    const result = await pool.query('SELECT * FROM clientes WHERE codigo_externo = $1 LIMIT 1', [codigoExterno]);
    if (result.rows[0]) {
      return result.rows[0];
    }
  }

  if (cleanEmail) {
    const result = await pool.query('SELECT * FROM clientes WHERE LOWER(email) = $1 LIMIT 1', [cleanEmail]);
    if (result.rows[0]) {
      return result.rows[0];
    }
  }

  if (cleanPhone) {
    const result = await pool.query(`
      SELECT *
      FROM clientes
      WHERE regexp_replace(COALESCE(telefono, ''), '\\D', '', 'g') = $1
         OR regexp_replace(COALESCE(telefono, ''), '\\D', '', 'g') LIKE '%' || RIGHT($1, 10)
      LIMIT 1
    `, [cleanPhone]);
    if (result.rows[0]) {
      return result.rows[0];
    }
  }

  return null;
}

async function getDefaultAssignees(client) {
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

async function createTicketFromExternal(input) {
  const canal = CHANNELS.has(input.canal) ? input.canal : 'web';
  const matchedClient = input.clienteId
    ? { id: input.clienteId }
    : await findClientByOrigin({
      email: input.origenEmail,
      phone: input.origenTelefono,
      codigoExterno: input.codigoExterno
    });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const maxRes = await client.query('SELECT COALESCE(MAX(nro_ticket), 90000) + 1 AS next FROM tickets');
    const nroTicket = maxRes.rows[0].next;
    const defaultUserId = await getDefaultAssignees(client);
    const reclamo = input.reclamo || input.cuerpo || input.asunto || 'Solicitud recibida desde canal externo';
    const observacion = input.observacion || (matchedClient ? '' : 'Pendiente de clasificar: no se encontro cliente por origen.');

    const ticketRes = await client.query(`
      INSERT INTO tickets (
        nro_ticket, cliente_id, reclamo, observacion, asunto, prioridad, estado,
        canal_origen, origen_contacto, origen_email, origen_telefono, origen_mensaje_id,
        referencia_externa, proceso, bolsa_asignada, receptor_id, ejecutor_id, fecha_creacion, fecha_asignacion
      ) VALUES ($1, $2, $3, $4, $5, $6, 'Pendiente', $7, $8, $9, $10, $11, $12, $13, 'soporte', $14, $14, NOW(), NOW())
      RETURNING id, nro_ticket
    `, [
      nroTicket,
      matchedClient?.id || null,
      reclamo,
      observacion,
      input.asunto || null,
      input.prioridad || 'Media',
      canal,
      input.origenContacto || null,
      input.origenEmail || null,
      input.origenTelefono || null,
      input.origenMensajeId || null,
      input.referenciaExterna || null,
      input.proceso || null,
      defaultUserId
    ]);

    const ticket = ticketRes.rows[0];
    await client.query(`
      INSERT INTO comentarios (ticket_id, usuario_id, comentario, tipo, visible_cliente)
      VALUES ($1, $2, $3, 'comentario', false)
    `, [
      ticket.id,
      defaultUserId,
      `Ticket creado desde ${canal}. ${matchedClient ? 'Cliente asociado automaticamente.' : 'Sin cliente asociado automaticamente.'}`
    ]);

    await client.query(`
      INSERT INTO ticket_comunicaciones (
        ticket_id, canal, direccion, proveedor, mensaje_id, remitente, destinatario, asunto, cuerpo, payload
      ) VALUES ($1, $2, 'entrada', $3, $4, $5, $6, $7, $8, $9)
    `, [
      ticket.id,
      canal,
      input.proveedor || null,
      input.origenMensajeId || null,
      input.remitente || input.origenEmail || input.origenTelefono || null,
      input.destinatario || null,
      input.asunto || null,
      input.cuerpo || input.reclamo || null,
      input.payload ? JSON.stringify(input.payload) : null
    ]);

    await client.query('COMMIT');

    await notificarTicket({
      ticketId: ticket.id,
      tipo: 'nuevo',
      mensaje: `Nuevo ticket #${ticket.nro_ticket} desde ${canal}`,
      usuarioOrigenId: defaultUserId
    });

    return {
      id: ticket.id,
      nro_ticket: ticket.nro_ticket,
      canal_origen: canal,
      cliente_asociado: Boolean(matchedClient),
      cliente_id: matchedClient?.id || null,
      resumen: summarizeText(reclamo)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function buildPossibleTicketSummary(message, matchedClient) {
  return {
    canal_origen: message.canal || 'mail',
    asunto: message.asunto || 'Sin asunto',
    reclamo_sugerido: summarizeText(message.cuerpo || message.text || message.asunto, 900),
    prioridad_sugerida: /urgente|caido|no funciona|bloqueado|error/i.test(`${message.asunto || ''} ${message.cuerpo || ''}`) ? 'Alta' : 'Media',
    cliente_detectado: matchedClient ? {
      id: matchedClient.id,
      nombre: matchedClient.nombre,
      email: matchedClient.email,
      telefono: matchedClient.telefono
    } : null,
    requiere_clasificacion: !matchedClient
  };
}

module.exports = {
  createTicketFromExternal,
  findClientByOrigin,
  buildPossibleTicketSummary,
  normalizeEmail,
  normalizePhone,
  summarizeText
};
