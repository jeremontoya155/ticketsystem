const { buildDevAssistant } = require('./dev-radar');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
let rotationIndex = 0;

function getGroqConfig() {
  const keys = String(process.env.GROQ_API_KEYS || '')
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    enabled: process.env.GROQ_BETA_ENABLED === 'true',
    keys,
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
  };
}

function buildPrompt({ ticket, devAssistant, focus }) {
  const relatedBlock = devAssistant.relatedTickets.length
    ? devAssistant.relatedTickets.map((item) => (
      `- Ticket #${item.nro_ticket} | estado: ${item.estado} | score: ${item.score}\n` +
      `  motivo: ${item.reasons.join(', ') || 'similitud textual'}\n` +
      `  reclamo: ${item.reclamo || 'sin reclamo'}\n` +
      `  snippet: ${item.snippet || 'sin comentario util'}`
    )).join('\n')
    : '- No hay antecedentes fuertes en el historial local.';

  const signalsBlock = devAssistant.signals.length
    ? devAssistant.signals.map((signal) => `- ${signal.title}: ${signal.advice}`).join('\n')
    : '- Sin señales dominantes; conviene validar reproduccion, datos y flujo.';

  const checklistBlock = devAssistant.checklist.map((item) => `- ${item}`).join('\n');
  const focusBlock = focus ? `Foco extra pedido por el desarrollador: ${focus}` : 'No hay foco extra; priorizar una solucion realista y citables antecedentes.';

  return [
    'Sos un copiloto tecnico beta para un sistema interno de tickets de soporte y desarrollo.',
    'Tu objetivo es proponer una solucion realista, citar antecedentes del historial y dejar un texto util para comentario tecnico.',
    'No inventes hechos. Si no estas seguro, decilo como hipotesis.',
    'Responde en espanol rioplatense, claro y practico.',
    '',
    `Ticket actual #${ticket.nro_ticket}`,
    `Empresa: ${ticket.cliente_nombre || 'Sin empresa'}`,
    `Estado: ${ticket.estado}`,
    `Prioridad: ${ticket.prioridad}`,
    `Tipo ticket: ${ticket.tipo_ticket || 'Soporte normal'}`,
    `Reclamo: ${ticket.reclamo || ''}`,
    `Observacion: ${ticket.observacion || 'Sin observaciones'}`,
    '',
    'Senales tecnicas detectadas:',
    signalsBlock,
    '',
    'Checklist local sugerido:',
    checklistBlock,
    '',
    'Antecedentes relacionados del historial:',
    relatedBlock,
    '',
    focusBlock,
    '',
    'Entrega la respuesta en este formato exacto:',
    '1. Diagnostico probable',
    '2. Solucion sugerida',
    '3. Antecedentes utiles',
    '4. Riesgos o validaciones',
    '5. Comentario tecnico listo para pegar'
  ].join('\n');
}

async function callGroq(messages) {
  const config = getGroqConfig();

  if (!config.enabled) {
    throw new Error('Groq beta deshabilitado');
  }

  if (!config.keys.length) {
    throw new Error('No hay GROQ_API_KEYS configuradas');
  }

  const orderedKeys = config.keys.map((_, index) => config.keys[(rotationIndex + index) % config.keys.length]);
  let lastError;

  for (let attempt = 0; attempt < orderedKeys.length; attempt++) {
    const apiKey = orderedKeys[attempt];
    try {
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.35,
          max_completion_tokens: 900,
          messages
        })
      });

      if (!response.ok) {
        const body = await response.text();
        const error = new Error(`Groq respondio ${response.status}`);
        error.status = response.status;
        error.body = body;
        throw error;
      }

      const json = await response.json();
      rotationIndex = (rotationIndex + attempt + 1) % config.keys.length;

      return {
        content: json.choices?.[0]?.message?.content || '',
        model: json.model || config.model,
        usage: json.usage || null,
        keyIndexUsed: (rotationIndex + config.keys.length - 1) % config.keys.length
      };
    } catch (error) {
      lastError = error;
      const retryable = !error.status || [401, 429, 500, 502, 503, 504].includes(error.status);
      if (!retryable || attempt === orderedKeys.length - 1) {
        break;
      }
    }
  }

  throw lastError || new Error('No se pudo completar la consulta a Groq');
}

async function generateGroqSolution({ ticket, focus }) {
  const devAssistant = await buildDevAssistant(ticket);
  const prompt = buildPrompt({ ticket, devAssistant, focus });

  const result = await callGroq([
    {
      role: 'system',
      content: 'Sos un asistente tecnico beta para un equipo de desarrollo que trabaja tickets internos.'
    },
    {
      role: 'user',
      content: prompt
    }
  ]);

  return {
    ...result,
    devAssistant
  };
}

module.exports = {
  generateGroqSolution,
  getGroqConfig
};
