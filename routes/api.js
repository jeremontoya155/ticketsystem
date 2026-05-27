const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireLogin, requireDesarrollo, isClient } = require('../middleware/auth');
const { fetchTicketContext } = require('../services/dev-radar');
const { generateGroqSolution, getGroqConfig } = require('../services/groq-beta');
const { fetchRecentMailPreviews, importMailAsTicket } = require('../services/mail-intake');
const { createTicketFromExternal, findClientByOrigin } = require('../services/ticket-ingestion');

function buildSearchTokens(value) {
  const stopWords = new Set(['para', 'pero', 'como', 'este', 'esta', 'esto', 'con', 'sin', 'por', 'del', 'las', 'los', 'una', 'unos', 'unas', 'que']);

  return Array.from(new Set(String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]{4,}/g) || []))
    .filter((token) => !stopWords.has(token))
    .slice(0, 6);
}

function requireWebhookToken(req, res, next) {
  const expectedToken = process.env.WHATSAPP_AUTH_TOKEN || process.env.WHATSAPP_WEBHOOK_TOKEN;
  if (!expectedToken) {
    return next();
  }

  const authHeader = req.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const receivedToken = req.get('x-webhook-token') || bearerToken;

  if (receivedToken !== expectedToken) {
    return res.status(401).json({ ok: false, error: 'Token de webhook invalido' });
  }

  next();
}

async function fetchSimilarOpenTickets(clienteId, texto, limit = 5) {
  const tokens = buildSearchTokens(texto);
  if (!clienteId || tokens.length === 0) {
    return [];
  }

  const params = [clienteId];
  const tokenFilters = tokens.map((token) => {
    params.push(`%${token}%`);
    const idx = params.length;
    return `(t.asunto ILIKE $${idx} OR t.reclamo ILIKE $${idx})`;
  });

  params.push(Math.max(1, Math.min(parseInt(limit, 10) || 5, 20)));
  const result = await pool.query(`
    SELECT id, nro_ticket, asunto, estado, prioridad, fecha_creacion
    FROM tickets t
    WHERE t.cliente_id = $1
      AND t.estado IN ('Pendiente', 'En Proceso')
      AND (${tokenFilters.join(' OR ')})
    ORDER BY
      CASE t.estado WHEN 'En Proceso' THEN 1 ELSE 2 END,
      t.fecha_creacion DESC
    LIMIT $${params.length}
  `, params);

  return result.rows;
}

router.post('/auth/whatsapp', (req, res) => {
  const expectedUser = process.env.WHATSAPP_AUTH_USER;
  const expectedPass = process.env.WHATSAPP_AUTH_PASS;
  const configuredToken = process.env.WHATSAPP_AUTH_TOKEN || process.env.WHATSAPP_WEBHOOK_TOKEN || null;
  const body = req.body || {};

  if (!expectedUser || !expectedPass) {
    return res.status(503).json({
      ok: false,
      error: 'WHATSAPP_AUTH_USER y WHATSAPP_AUTH_PASS no estan configurados en .env'
    });
  }

  if (body.user !== expectedUser || body.password !== expectedPass) {
    return res.status(401).json({ ok: false, error: 'Credenciales invalidas' });
  }

  return res.json({
    ok: true,
    auth: 'ok',
    token: configuredToken,
    note: configuredToken
      ? 'Usa este token en Authorization: Bearer <token> para /api/webhooks/whatsapp'
      : 'No hay token de webhook configurado. El webhook acepta requests autenticados por red interna.'
  });
});

router.get('/notificaciones', requireLogin, async (req, res) => {
  const result = await pool.query(`
    SELECT n.*, t.nro_ticket
    FROM notificaciones n
    LEFT JOIN tickets t ON n.ticket_id = t.id
    WHERE n.usuario_id = $1 AND n.leida = false
    ORDER BY n.created_at DESC
    LIMIT 15
  `, [req.session.user.id]);

  res.json(result.rows);
});

router.post('/notificaciones/:id/leer', requireLogin, async (req, res) => {
  await pool.query(
    'UPDATE notificaciones SET leida = true WHERE id = $1 AND usuario_id = $2',
    [req.params.id, req.session.user.id]
  );
  res.json({ ok: true });
});

router.post('/notificaciones/leer-todas', requireLogin, async (req, res) => {
  await pool.query('UPDATE notificaciones SET leida = true WHERE usuario_id = $1', [req.session.user.id]);
  res.json({ ok: true });
});

router.get('/stats', requireLogin, async (_req, res) => {
  const [estadoRes, prioridadRes, tendenciaRes, canalRes] = await Promise.all([
    pool.query('SELECT estado, COUNT(*) AS total FROM tickets GROUP BY estado'),
    pool.query('SELECT prioridad, COUNT(*) AS total FROM tickets GROUP BY prioridad'),
    pool.query(`
      SELECT DATE_TRUNC('week', fecha_creacion)::date AS semana, COUNT(*) AS total
      FROM tickets
      WHERE fecha_creacion >= NOW() - INTERVAL '12 weeks'
      GROUP BY semana
      ORDER BY semana
    `),
    pool.query(`
      SELECT COALESCE(canal_origen, 'web') AS canal, COUNT(*) AS total
      FROM tickets
      GROUP BY COALESCE(canal_origen, 'web')
      ORDER BY total DESC
    `)
  ]);

  res.json({
    estados: estadoRes.rows,
    prioridades: prioridadRes.rows,
    tendencia: tendenciaRes.rows,
    canales: canalRes.rows
  });
});

router.get('/tickets/similares', requireLogin, async (req, res) => {
  try {
    const user = req.session.user;
    const clienteId = isClient(user) ? user.cliente_id : req.query.cliente_id;
    const texto = `${req.query.asunto || ''} ${req.query.reclamo || ''}`;
    const tickets = await fetchSimilarOpenTickets(clienteId, texto, req.query.limit || 5);
    res.json({ ok: true, tickets });
  } catch (error) {
    console.error('Similar tickets error:', error.message);
    res.status(500).json({ ok: false, error: 'No se pudieron consultar tickets similares' });
  }
});

router.get('/mail/intake/preview', requireLogin, async (req, res) => {
  try {
    if (isClient(req.session.user)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido' });
    }

    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const result = await fetchRecentMailPreviews({ limit });
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Mail intake preview error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/mail/intake/import', requireLogin, async (req, res) => {
  try {
    if (isClient(req.session.user)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido' });
    }

    const ticket = await importMailAsTicket({
      messageId: req.body?.messageId,
      uid: req.body?.uid,
      limit: req.body?.limit || 50
    });

    res.json({ ok: true, ticket });
  } catch (error) {
    console.error('Mail intake import error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/webhooks/whatsapp', requireWebhookToken, async (req, res) => {
  try {
    const payload = req.body || {};
    const text = payload.text || payload.message || payload.body || '';
    const phone = payload.phone || payload.from || payload.sender_phone || payload.senderPhone;
    const name = payload.name || payload.sender_name || payload.senderName || '';
    const externalId = payload.messageId || payload.message_id || payload.id || payload.external_id;

    if (!phone || !text) {
      return res.status(400).json({ ok: false, error: 'Faltan phone/from y text/message/body' });
    }

    const asunto = payload.subject || `WhatsApp de ${name || phone}`;
    const matchedClient = await findClientByOrigin({
      phone,
      email: payload.email || payload.origen_email,
      codigoExterno: payload.clientCode || payload.codigo_cliente
    });
    const similares = await fetchSimilarOpenTickets(matchedClient?.id, `${asunto} ${text}`, payload.similarLimit || 5);
    const dryRun = payload.dryRun === true || payload.dry_run === true || payload.onlyEvaluate === true;

    if (dryRun) {
      return res.json({
        ok: true,
        mode: 'evaluation',
        shouldCreateTicket: !similares.length,
        similarTickets: similares,
        clienteDetectado: matchedClient ? {
          id: matchedClient.id,
          nombre: matchedClient.nombre,
          email: matchedClient.email,
          telefono: matchedClient.telefono
        } : null
      });
    }

    const ticket = await createTicketFromExternal({
      canal: 'whatsapp',
      proveedor: payload.provider || 'bot-externo',
      origenMensajeId: externalId,
      origenTelefono: phone,
      origenContacto: name,
      remitente: phone,
      asunto,
      reclamo: text,
      cuerpo: text,
      referenciaExterna: payload.reference || payload.referencia || null,
      proceso: payload.process || payload.proceso || null,
      payload
    });

    res.status(201).json({
      ok: true,
      ticket,
      similarTickets: similares,
      reply: `Recibimos tu reclamo. Ticket #${ticket.nro_ticket}.`
    });
  } catch (error) {
    console.error('WhatsApp webhook error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/groq/status', requireLogin, requireDesarrollo, (_req, res) => {
  const config = getGroqConfig();
  res.json({
    enabled: config.enabled,
    configuredKeys: config.keys.length,
    model: config.model,
    mode: 'beta'
  });
});

router.post('/tickets/:id/groq-solution', requireLogin, requireDesarrollo, async (req, res) => {
  try {
    const ticket = await fetchTicketContext(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    const result = await generateGroqSolution({
      ticket,
      focus: req.body?.focus || ''
    });

    res.json({
      ok: true,
      beta: true,
      model: result.model,
      usage: result.usage,
      content: result.content
    });
  } catch (error) {
    console.error('Groq beta error:', error.message);
    res.status(500).json({
      ok: false,
      beta: true,
      error: error.message || 'No se pudo generar la propuesta con Groq'
    });
  }
});

module.exports = router;
