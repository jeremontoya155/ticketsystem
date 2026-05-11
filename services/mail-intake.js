const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const {
  buildPossibleTicketSummary,
  createTicketFromExternal,
  findClientByOrigin,
  summarizeText
} = require('./ticket-ingestion');

function getMailIntakeConfig() {
  return {
    host: process.env.MAIL_INTAKE_HOST || process.env.IMAP_HOST,
    port: parseInt(process.env.MAIL_INTAKE_PORT || process.env.IMAP_PORT || '993', 10),
    secure: String(process.env.MAIL_INTAKE_SECURE || process.env.IMAP_SECURE || 'true') !== 'false',
    user: process.env.MAIL_INTAKE_USER || process.env.IMAP_USER || process.env.MAIL_USER,
    pass: process.env.MAIL_INTAKE_PASS || process.env.IMAP_PASS || process.env.MAIL_PASS,
    mailbox: process.env.MAIL_INTAKE_MAILBOX || process.env.IMAP_MAILBOX || 'INBOX'
  };
}

function isConfigured(config = getMailIntakeConfig()) {
  return Boolean(config.host && config.user && config.pass);
}

function buildClient(config) {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    logger: false
  });
}

async function parseMessage(msg) {
  const parsed = await simpleParser(msg.source);
  const from = parsed.from?.value?.[0] || {};
  const text = parsed.text || parsed.html || '';
  const matchedClient = await findClientByOrigin({ email: from.address });

  return {
    uid: msg.uid,
    messageId: parsed.messageId || msg.envelope?.messageId || String(msg.uid),
    from: {
      name: from.name || '',
      address: from.address || ''
    },
    subject: parsed.subject || '(Sin asunto)',
    date: parsed.date || msg.envelope?.date || null,
    text: summarizeText(text, 1200),
    hasAttachments: Boolean(parsed.attachments?.length),
    attachmentsCount: parsed.attachments?.length || 0,
    possibleTicket: buildPossibleTicketSummary({
      canal: 'mail',
      asunto: parsed.subject,
      cuerpo: text
    }, matchedClient)
  };
}

async function fetchRecentMailPreviews({ limit = 10 } = {}) {
  const config = getMailIntakeConfig();
  if (!isConfigured(config)) {
    return {
      configured: false,
      mailbox: config.mailbox,
      emails: [],
      message: 'Falta configurar MAIL_INTAKE_HOST, MAIL_INTAKE_USER y MAIL_INTAKE_PASS para leer correos entrantes.'
    };
  }

  const client = buildClient(config);
  await client.connect();

  try {
    const mailbox = await client.mailboxOpen(config.mailbox);
    if (!mailbox.exists) {
      return { configured: true, mailbox: config.mailbox, emails: [] };
    }

    const start = Math.max(1, mailbox.exists - Math.max(parseInt(limit, 10), 1) + 1);
    const emails = [];

    for await (const msg of client.fetch(`${start}:*`, { envelope: true, source: true, uid: true })) {
      emails.push(await parseMessage(msg));
    }

    emails.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return { configured: true, mailbox: config.mailbox, emails };
  } finally {
    await client.logout();
  }
}

async function importMailAsTicket({ messageId, uid, limit = 50 } = {}) {
  const preview = await fetchRecentMailPreviews({ limit });
  const email = preview.emails.find((item) => (
    (messageId && item.messageId === messageId) || (uid && String(item.uid) === String(uid))
  ));

  if (!email) {
    throw new Error('No se encontro el mail solicitado en la ventana de busqueda configurada.');
  }

  return createTicketFromExternal({
    canal: 'mail',
    proveedor: 'imap',
    origenMensajeId: email.messageId,
    origenEmail: email.from.address,
    origenContacto: email.from.name,
    remitente: email.from.address,
    asunto: email.subject,
    reclamo: email.text,
    cuerpo: email.text,
    prioridad: email.possibleTicket.prioridad_sugerida,
    payload: email
  });
}

module.exports = {
  fetchRecentMailPreviews,
  importMailAsTicket,
  getMailIntakeConfig,
  isConfigured
};
