const { pool } = require('../config/db');
const { notificarTicket } = require('../config/mailer');

const CHANNELS = new Set(['web', 'mail', 'whatsapp', 'vfp']);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeCompanyName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function summarizeText(value, maxLength = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

async function findClientByCompanyContact({ cleanEmail, cleanPhone }) {
  if (cleanEmail) {
    const byEmail = await pool.query(`
      SELECT c.*
      FROM cliente_contactos cc
      INNER JOIN clientes c ON c.id = cc.cliente_id
      WHERE cc.activo = true
        AND LOWER(COALESCE(cc.email, '')) = $1
      ORDER BY cc.principal DESC, cc.orden ASC, cc.id ASC
      LIMIT 1
    `, [cleanEmail]);

    if (byEmail.rows[0]) {
      return byEmail.rows[0];
    }
  }

  if (cleanPhone) {
    const byPhone = await pool.query(`
      SELECT c.*
      FROM cliente_contactos cc
      INNER JOIN clientes c ON c.id = cc.cliente_id
      WHERE cc.activo = true
        AND (
          regexp_replace(COALESCE(cc.telefono, ''), '\\D', '', 'g') = $1
          OR regexp_replace(COALESCE(cc.telefono, ''), '\\D', '', 'g') LIKE '%' || RIGHT($1, 10)
        )
      ORDER BY cc.principal DESC, cc.orden ASC, cc.id ASC
      LIMIT 1
    `, [cleanPhone]);

    if (byPhone.rows[0]) {
      return byPhone.rows[0];
    }
  }

  return null;
}

async function findClientByOrigin({
  email,
  phone,
  codigoExterno,
  nombreEmpresa,
  empresa,
  companyName,
  company
} = {}) {
  const cleanEmail = normalizeEmail(email);
  const cleanPhone = normalizePhone(phone);
  const normalizedCompany = normalizeCompanyName(nombreEmpresa || empresa || companyName || company);

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

    const byCompanyEmail = await findClientByCompanyContact({ cleanEmail, cleanPhone: '' });
    if (byCompanyEmail) {
      return byCompanyEmail;
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

    const byCompanyPhone = await findClientByCompanyContact({ cleanEmail: '', cleanPhone });
    if (byCompanyPhone) {
      return byCompanyPhone;
    }
  }

  if (normalizedCompany) {
    const exactResult = await pool.query(`
      SELECT *
      FROM clientes
      WHERE LOWER(nombre) = $1
      LIMIT 1
    `, [normalizedCompany]);
    if (exactResult.rows[0]) {
      return exactResult.rows[0];
    }

    const fuzzyResult = await pool.query(`
      SELECT *
      FROM clientes
      WHERE LOWER(nombre) LIKE '%' || $1 || '%'
         OR $1 LIKE '%' || LOWER(nombre) || '%'
      ORDER BY LENGTH(nombre) ASC
      LIMIT 1
    `, [normalizedCompany]);
    if (fuzzyResult.rows[0]) {
      return fuzzyResult.rows[0];
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

async function getSuggestedAdminAssignee(client, canal) {
  if (canal !== 'whatsapp') {
    return null;
  }

  const result = await client.query(`
    SELECT id
    FROM usuarios
    WHERE activo = true
      AND rol IN ('admin_soporte', 'admin', 'admin_desarrollo')
    ORDER BY CASE
      WHEN rol = 'admin_soporte' THEN 1
      WHEN rol = 'admin' THEN 2
      WHEN rol = 'admin_desarrollo' THEN 3
      ELSE 4
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
      codigoExterno: input.codigoExterno,
      nombreEmpresa: input.nombreEmpresa,
      empresa: input.empresa,
      companyName: input.companyName,
      company: input.company
    });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const maxRes = await client.query('SELECT COALESCE(MAX(nro_ticket), 90000) + 1 AS next FROM tickets');
    const nroTicket = maxRes.rows[0].next;
    const suggestedAdminUserId = await getSuggestedAdminAssignee(client, canal);
    const defaultUserId = suggestedAdminUserId || await getDefaultAssignees(client);
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
      `Ticket creado desde ${canal}. ${matchedClient ? 'Cliente asociado automaticamente.' : 'Sin cliente asociado automaticamente.'}${suggestedAdminUserId ? ' Asignacion inicial sugerida a admin para triage rapido.' : ''}`
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
      assigned_user_id: defaultUserId,
      assigned_to_admin_suggestion: Boolean(suggestedAdminUserId),
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
  const combined = `${message.asunto || ''} ${message.cuerpo || ''} ${message.text || ''}`.toLowerCase();
  
  // Señales de que es un ticket válido
  const signals = [];
  let score = 0;

  // 1. Cliente detectado (+30 pts)
  if (matchedClient) {
    score += 30;
    signals.push('cliente_conocido');
  }

  // 2. Palabras clave de problema/soporte (+20 pts cada una, max 40)
  const problemKeywords = [
    'urgente', 'caido', 'no funciona', 'bloqueado', 'error', 'falla', 'problema',
    'no puedo', 'no se puede', 'imposible', 'no abre', 'no cierra', 'no carga',
    'necesito', 'solicito', 'reclamo', 'consulta', 'ayuda', 'soporte',
    'recepcion', 'armado', 'desarrollo', 'bug', 'crash', 'lento', 'traba'
  ];
  const foundKeywords = problemKeywords.filter(kw => combined.includes(kw));
  const keywordScore = Math.min(foundKeywords.length * 15, 40);
  score += keywordScore;
  if (foundKeywords.length > 0) {
    signals.push(`keywords(${foundKeywords.slice(0, 3).join(',')})`);
  }

  // 3. Estructura de ticket (+20 pts)
  const ticketPatterns = [
    /ticket\s*#?\d+/i,
    /nro\s*de\s*ticket/i,
    /referencia[:\s]/i,
    /comprobante[:\s]/i,
    /recepcion[:\s]/i,
    /pedido[:\s]/i,
    /orden[:\s]/i,
    /cliente[:\s]/i,
    /empresa[:\s]/i
  ];
  const foundPatterns = ticketPatterns.filter(p => p.test(combined));
  if (foundPatterns.length > 0) {
    score += 20;
    signals.push('estructura_ticket');
  }

  // 4. Tiene cuerpo sustancial (+10 pts)
  const bodyLength = (message.cuerpo || message.text || '').length;
  if (bodyLength > 50) {
    score += 10;
    signals.push('cuerpo_sustancial');
  }

  // 5. Prioridad sugerida
  const isUrgent = /urgente|caido|no funciona|bloqueado|error|crash|crítico/i.test(combined);
  const prioridadSugerida = isUrgent ? 'Alta' : 'Media';

  // Determinar nivel de confianza
  let confianza = 'baja';
  if (score >= 60) confianza = 'alta';
  else if (score >= 30) confianza = 'media';

  return {
    canal_origen: message.canal || 'mail',
    asunto: message.asunto || 'Sin asunto',
    reclamo_sugerido: summarizeText(message.cuerpo || message.text || message.asunto, 900),
    prioridad_sugerida: prioridadSugerida,
    cliente_detectado: matchedClient ? {
      id: matchedClient.id,
      nombre: matchedClient.nombre,
      email: matchedClient.email,
      telefono: matchedClient.telefono
    } : null,
    requiere_clasificacion: !matchedClient,
    // Nuevos campos para UI
    confianza,
    score: Math.min(score, 100),
    signals,
    keywords_found: foundKeywords.slice(0, 5),
    es_posible_ticket: score >= 20
  };
}

module.exports = {
  createTicketFromExternal,
  findClientByOrigin,
  buildPossibleTicketSummary,
  normalizeEmail,
  normalizePhone,
  normalizeCompanyName,
  summarizeText
};
