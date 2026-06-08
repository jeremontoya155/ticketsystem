require('dotenv').config();
const nodemailer = require('nodemailer');

const examples = [
  {
    tag: 'recepcion-urgente',
    replyTo: 'lucia.perez@alfaretail.com',
    subject: 'Urgente - no funciona cierre de recepcion 4587',
    text: [
      'Buen dia, no podemos cerrar la recepcion 4587.',
      'Al confirmar queda bloqueado y muestra error 500.',
      'Necesitamos liberar la mercaderia antes del cierre del turno.',
      '',
      'Cliente: Alfa Retail S.A.',
      'Proceso: recepcion',
      'Referencia: REC-4587'
    ].join('\n')
  },
  {
    tag: 'armado-consulta',
    replyTo: 'marta.ruiz@gammalogistica.com',
    subject: 'Consulta armado - diferencia en bultos preparados',
    text: [
      'Hola, estamos revisando el armado del pedido ARM-9021.',
      'El sistema informa 14 bultos preparados pero fisicamente tenemos 13.',
      'No sabemos si corresponde anular el armado o ajustar la lectura.',
      '',
      'Cliente: Gamma Logistica',
      'Proceso: armado',
      'Referencia: ARM-9021'
    ].join('\n')
  },
  {
    tag: 'desarrollo-powerbi',
    replyTo: 'carlos.diaz@betasalud.com',
    subject: 'Solicitud desarrollo - alias para usuarios Power BI',
    text: [
      'Buenas, necesitamos confirmar si se pueden crear alias para usuarios de Power BI.',
      'La idea es que todos queden bajo el mismo dominio para poder compartir tableros.',
      'Usuarios sugeridos: lectura1@cliente.com, lectura2@cliente.com.',
      '',
      'Cliente: Beta Salud SRL',
      'Proceso: desarrollo'
    ].join('\n')
  }
];

function getConfig() {
  const to = process.env.MAIL_EXAMPLES_TO
    || process.env.MAIL_INTAKE_USER
    || process.env.IMAP_USER
    || process.env.MAIL_USER;

  return {
    to,
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT, 10) || 587,
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    prefix: process.env.MAIL_EXAMPLES_PREFIX || '[TicketSystem Demo]'
  };
}

async function main() {
  const config = getConfig();
  if (!config.user || !config.pass || !config.to) {
    throw new Error('Falta configurar MAIL_USER, MAIL_PASS y una casilla destino MAIL_EXAMPLES_TO/MAIL_INTAKE_USER/IMAP_USER.');
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: false,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });

  const batchId = Date.now();
  const sent = [];

  for (const [index, example] of examples.entries()) {
    const subject = `${config.prefix} ${example.subject} (${batchId}-${index + 1})`;
    await transporter.sendMail({
      from: config.from,
      to: config.to,
      replyTo: example.replyTo,
      subject,
      text: `${example.text}\n\nDemo ID: ${example.tag}-${batchId}`
    });

    sent.push({ tag: example.tag, subject });
  }

  console.log(JSON.stringify({ ok: true, sent }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
