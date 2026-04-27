const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireLogin, requireDesarrollo } = require('../middleware/auth');
const { fetchTicketContext } = require('../services/dev-radar');
const { generateGroqSolution, getGroqConfig } = require('../services/groq-beta');

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
  const [estadoRes, prioridadRes, tendenciaRes] = await Promise.all([
    pool.query('SELECT estado, COUNT(*) AS total FROM tickets GROUP BY estado'),
    pool.query('SELECT prioridad, COUNT(*) AS total FROM tickets GROUP BY prioridad'),
    pool.query(`
      SELECT DATE_TRUNC('week', fecha_creacion)::date AS semana, COUNT(*) AS total
      FROM tickets
      WHERE fecha_creacion >= NOW() - INTERVAL '12 weeks'
      GROUP BY semana
      ORDER BY semana
    `)
  ]);

  res.json({
    estados: estadoRes.rows,
    prioridades: prioridadRes.rows,
    tendencia: tendenciaRes.rows
  });
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
