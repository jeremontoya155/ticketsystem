const { pool } = require('../config/db');

const STOP_WORDS = new Set([
  'para', 'como', 'esto', 'esta', 'este', 'desde', 'entre', 'sobre', 'donde', 'cuando',
  'porque', 'tiene', 'tenemos', 'necesita', 'necesitamos', 'puede', 'pueden', 'hacer',
  'nuevo', 'nueva', 'ticket', 'datos', 'sistema', 'general', 'normal', 'cliente',
  'empresa', 'favor', 'carga', 'dejar', 'luego', 'todas', 'todos', 'misma', 'mismo',
  'seria', 'tengo', 'tiene', 'the', 'with', 'from', 'that', 'then', 'your', 'have',
  'error', 'issue', 'problema', 'solucion', 'solicita', 'solicitud'
]);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractKeywords(...chunks) {
  const matches = normalizeText(chunks.join(' '))
    .match(/[a-z0-9]{4,}/g) || [];

  return [...new Set(matches.filter((word) => !STOP_WORDS.has(word) && !/^\d+$/.test(word)))];
}

function detectTechnicalSignals(ticket) {
  const source = normalizeText([
    ticket.reclamo,
    ticket.observacion,
    ticket.tipo_ticket,
    ticket.tipo_cliente_nombre,
    ticket.cliente_nombre
  ].join(' '));

  const rules = [
    {
      terms: ['mail', 'smtp', 'gmail', 'correo', 'email'],
      title: 'Correo / SMTP',
      advice: 'Validar credenciales, remitente, puertos y revisar si la accion esperada necesita trazas de envio o reintentos.'
    },
    {
      terms: ['powerbi', 'power', 'bi', 'dashboard', 'reporte'],
      title: 'BI / Reportes',
      advice: 'Revisar permisos, origen de datos, filtros y si conviene dejar una salida exportable o una vista dedicada.'
    },
    {
      terms: ['importador', 'importacion', 'excel', 'xml', 'csv'],
      title: 'Importacion de datos',
      advice: 'Confirmar formato esperado, validar casos borde y guardar ejemplos de entrada/salida para futuras referencias.'
    },
    {
      terms: ['api', 'web', 'frontend', 'vista', 'app'],
      title: 'App / Web',
      advice: 'Chequear reproducibilidad visual, payloads reales y diferencias entre entorno de prueba, web y mobile.'
    },
    {
      terms: ['stock', 'recepcion', 'logistica', 'pallet', 'posicion'],
      title: 'Logistica / Stock',
      advice: 'Cruzar reglas de negocio con datos reales y revisar si hay estados intermedios o distribuciones que no se contemplan.'
    },
    {
      terms: ['factura', 'afip', 'caea', 'comprobante', 'iva'],
      title: 'Fiscal / Comprobantes',
      advice: 'Verificar reglas fiscales, respuesta del servicio externo y documentar claramente el caso de negocio antes del ajuste.'
    }
  ];

  return rules.filter((rule) => rule.terms.some((term) => source.includes(term))).slice(0, 4);
}

function scoreRelatedTicket(currentTicket, candidate, currentKeywords) {
  const candidateText = normalizeText([
    candidate.reclamo,
    candidate.observacion,
    candidate.tipo_ticket,
    candidate.tipo_cliente_nombre
  ].join(' '));

  const candidateKeywords = extractKeywords(
    candidate.reclamo,
    candidate.observacion,
    candidate.tipo_ticket,
    candidate.tipo_cliente_nombre
  );

  const sharedKeywords = currentKeywords.filter((keyword) => candidateKeywords.includes(keyword));
  const reasons = [];
  let score = 0;

  if (candidate.cliente_id && candidate.cliente_id === currentTicket.cliente_id) {
    score += 28;
    reasons.push('misma empresa');
  }

  if (candidate.tipo_ticket && candidate.tipo_ticket === currentTicket.tipo_ticket) {
    score += 10;
    reasons.push('mismo tipo de ticket');
  }

  if (candidate.estado === 'Resuelto' || candidate.estado === 'Cerrado') {
    score += 8;
    reasons.push('ya resuelto');
  }

  if (sharedKeywords.length) {
    score += sharedKeywords.length * 4;
    reasons.push(`keywords: ${sharedKeywords.slice(0, 3).join(', ')}`);
  }

  if (currentKeywords.some((keyword) => candidateText.includes(keyword))) {
    score += 4;
  }

  return {
    ...candidate,
    score,
    reasons,
    sharedKeywords
  };
}

function buildChecklist(ticket, signals, relatedTickets) {
  const checklist = [];

  checklist.push('Reproducir el caso con los datos y filtros exactos del cliente.');

  if (!ticket.cant_archivos) {
    checklist.push('Pedir captura o evidencia visual si el problema depende de UI o resultado esperado.');
  } else {
    checklist.push('Revisar las imagenes adjuntas antes de tocar codigo para validar el contexto real.');
  }

  if (relatedTickets.some((item) => item.estado === 'Resuelto' || item.estado === 'Cerrado')) {
    checklist.push('Comparar con tickets resueltos similares para no duplicar una solucion ya conocida.');
  }

  if (signals.length) {
    checklist.push(`Validar el frente tecnico principal: ${signals.map((signal) => signal.title).join(', ')}.`);
  }

  checklist.push('Dejar comentario tecnico corto con causa, impacto y proximo paso para que otro dev pueda retomar rapido.');
  return checklist.slice(0, 5);
}

function buildSuggestedReply(ticket, signals, relatedTickets) {
  const relatedLines = relatedTickets.length
    ? `Antecedentes utiles: ${relatedTickets.slice(0, 2).map((item) => `#${item.nro_ticket}`).join(', ')}.`
    : 'No se detectaron antecedentes fuertes en el historial actual.';

  const signalLine = signals.length
    ? `Hipotesis principal: ${signals.map((signal) => signal.title).join(' / ')}.`
    : 'Hipotesis principal: revisar flujo funcional y reproducibilidad con datos del cliente.';

  return [
    `Analisis inicial del ticket #${ticket.nro_ticket}:`,
    '',
    `- ${signalLine}`,
    `- ${relatedLines}`,
    '- Siguiente paso sugerido: reproducir el caso con datos reales, aislar la causa y documentar si el ajuste es de datos, logica o interfaz.',
    '',
    'Comentario tecnico sugerido:',
    '"Se relevo el caso, se identificaron antecedentes relacionados y se avanza validando reproduccion, impacto y solucion reutilizable para dejar trazabilidad del ajuste."'
  ].join('\n');
}

async function fetchTicketContext(ticketId) {
  const ticketRes = await pool.query(`
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
    WHERE t.id = $1
  `, [ticketId]);

  return ticketRes.rows[0] || null;
}

async function buildDevAssistant(ticket) {
  const currentKeywords = extractKeywords(
    ticket.reclamo,
    ticket.observacion,
    ticket.tipo_ticket,
    ticket.tipo_cliente_nombre,
    ticket.cliente_nombre
  );

  const candidatesRes = await pool.query(`
    SELECT
      id,
      nro_ticket,
      cliente_id,
      estado,
      prioridad,
      reclamo,
      observacion,
      tipo_ticket,
      tipo_cliente_nombre,
      fecha_creacion
    FROM tickets
    WHERE id <> $1
    ORDER BY fecha_creacion DESC
    LIMIT 200
  `, [ticket.id]);

  const rankedTickets = candidatesRes.rows
    .map((candidate) => scoreRelatedTicket(ticket, candidate, currentKeywords))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.fecha_creacion) - new Date(a.fecha_creacion))
    .slice(0, 4);

  let snippetsByTicket = {};
  if (rankedTickets.length) {
    const commentsRes = await pool.query(`
      SELECT ticket_id, comentario, tipo, created_at
      FROM comentarios
      WHERE ticket_id = ANY($1::int[])
      ORDER BY created_at DESC
    `, [rankedTickets.map((item) => item.id)]);

    snippetsByTicket = commentsRes.rows.reduce((acc, row) => {
      if (!acc[row.ticket_id] && row.comentario && row.comentario.trim().length > 15) {
        acc[row.ticket_id] = row.comentario.trim();
      }
      return acc;
    }, {});
  }

  const signals = detectTechnicalSignals(ticket);
  const relatedTickets = rankedTickets.map((item) => ({
    ...item,
    snippet: snippetsByTicket[item.id] || null
  }));

  return {
    keywords: currentKeywords.slice(0, 8),
    signals,
    relatedTickets,
    checklist: buildChecklist(ticket, signals, relatedTickets),
    suggestedReply: buildSuggestedReply(ticket, signals, relatedTickets)
  };
}

module.exports = {
  buildDevAssistant,
  fetchTicketContext
};
