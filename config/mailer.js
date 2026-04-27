const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { pool } = require('../config/db');

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT, 10) || 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

async function enviarMail({ to, subject, html, attachments = [], silentIfUnavailable = false }) {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    if (silentIfUnavailable) {
      return false;
    }

    throw new Error('Falta configurar MAIL_USER y MAIL_PASS en el archivo .env');
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject,
    html,
    attachments
  });

  return true;
}

function renderTicketBox(ticket) {
  return `
    <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:18px 0">
      <div style="font-size:18px;font-weight:700;color:#1e3a8a">Ticket #${escapeHtml(ticket.nro_ticket)}</div>
      <div style="margin-top:6px;color:#334155"><strong>Empresa:</strong> ${escapeHtml(ticket.cliente_nombre || 'Sin empresa')}</div>
      <div style="margin-top:4px;color:#334155"><strong>Estado:</strong> ${escapeHtml(ticket.estado || 'Pendiente')} | <strong>Prioridad:</strong> ${escapeHtml(ticket.prioridad || 'Media')}</div>
      <div style="margin-top:12px;padding:12px;border-radius:8px;background:#f8fafc;color:#0f172a;white-space:pre-wrap">${nl2br(ticket.reclamo || '')}</div>
      ${ticket.observacion ? `<div style="margin-top:12px;color:#475569"><strong>Observaciones:</strong><br>${nl2br(ticket.observacion)}</div>` : ''}
    </div>
  `;
}

function buildAttachmentList(attachments) {
  if (!attachments.length) {
    return '';
  }

  return `
    <div style="margin-top:18px">
      <h4 style="margin:0 0 10px;color:#0f172a">Adjuntos incluidos</h4>
      <ul style="padding-left:20px;margin:0;color:#334155">
        ${attachments.map((attachment) => `<li>${escapeHtml(attachment.filename)}</li>`).join('')}
      </ul>
    </div>
  `;
}

async function cargarAdjuntosTicket(ticketId) {
  const result = await pool.query(`
    SELECT nombre_original, ruta
    FROM ticket_adjuntos
    WHERE ticket_id = $1
    ORDER BY created_at ASC
  `, [ticketId]);

  return result.rows
    .map((row) => {
      const filePath = path.join(__dirname, '..', 'public', row.ruta.replace(/^\//, '').replace(/\//g, path.sep));
      if (!fs.existsSync(filePath)) {
        return null;
      }

      return {
        filename: row.nombre_original,
        path: filePath
      };
    })
    .filter(Boolean);
}

async function enviarReporteTicket({ ticketId, to, subject, message, includeAttachments = false }) {
  const ticketRes = await pool.query(`
    SELECT
      t.nro_ticket,
      t.reclamo,
      t.observacion,
      t.estado,
      t.prioridad,
      t.fecha_creacion,
      t.fecha_resolucion,
      c.nombre AS cliente_nombre,
      c.email AS cliente_email,
      c.contacto_nombre
    FROM tickets t
    LEFT JOIN clientes c ON c.id = t.cliente_id
    WHERE t.id = $1
  `, [ticketId]);

  const ticket = ticketRes.rows[0];
  if (!ticket) {
    throw new Error('Ticket no encontrado');
  }

  const attachments = includeAttachments ? await cargarAdjuntosTicket(ticketId) : [];
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#f8fafc">
      <div style="background:#0f172a;color:white;padding:24px;border-radius:12px 12px 0 0">
        <h2 style="margin:0">Reporte de Ticket</h2>
        <p style="margin:8px 0 0;color:#cbd5e1">Seguimiento simple enviado desde TicketSystem</p>
      </div>
      <div style="background:#ffffff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
        <p style="margin-top:0;color:#0f172a">Hola ${escapeHtml(ticket.contacto_nombre || ticket.cliente_nombre || '')},</p>
        <div style="color:#334155;line-height:1.7">${nl2br(message)}</div>
        ${renderTicketBox(ticket)}
        ${buildAttachmentList(attachments)}
        <p style="margin:20px 0 0;color:#64748b;font-size:12px">Este correo fue generado desde el sistema interno de tickets.</p>
      </div>
    </div>
  `;

  await enviarMail({ to, subject, html, attachments });
}

async function notificarTicket({ ticketId, tipo, mensaje, usuarioOrigenId }) {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT
        t.nro_ticket, t.reclamo, t.estado, t.prioridad,
        u1.id as receptor_id, u1.nombre as receptor_nombre, u1.email as receptor_email, u1.notif_pantalla as r_pantalla, u1.notif_email as r_habilita_email,
        u2.id as ejecutor_id, u2.nombre as ejecutor_nombre, u2.email as ejecutor_email, u2.notif_pantalla as e_pantalla, u2.notif_email as e_habilita_email,
        cm1.email_notif as r_email_notif, cm1.notif_nuevo_ticket as r_notif_nuevo, cm1.notif_cambio_estado as r_notif_estado, cm1.notif_nuevo_comentario as r_notif_com, cm1.notif_asignacion as r_notif_asignacion,
        cm2.email_notif as e_email_notif, cm2.notif_nuevo_ticket as e_notif_nuevo, cm2.notif_cambio_estado as e_notif_estado, cm2.notif_nuevo_comentario as e_notif_com, cm2.notif_asignacion as e_notif_asignacion
      FROM tickets t
      LEFT JOIN usuarios u1 ON t.receptor_id = u1.id
      LEFT JOIN usuarios u2 ON t.ejecutor_id = u2.id
      LEFT JOIN config_mail cm1 ON u1.id = cm1.usuario_id
      LEFT JOIN config_mail cm2 ON u2.id = cm2.usuario_id
      WHERE t.id = $1
    `, [ticketId]);

    if (!res.rows[0]) {
      return;
    }

    const tk = res.rows[0];
    const destinatarios = [
      {
        id: tk.receptor_id,
        nombre: tk.receptor_nombre,
        email: tk.receptor_email,
        notifPantalla: tk.r_pantalla,
        habilitaEmail: tk.r_habilita_email,
        emailNotif: tk.r_email_notif,
        notifNuevo: tk.r_notif_nuevo,
        notifEstado: tk.r_notif_estado,
        notifComentario: tk.r_notif_com,
        notifAsignacion: tk.r_notif_asignacion
      },
      {
        id: tk.ejecutor_id,
        nombre: tk.ejecutor_nombre,
        email: tk.ejecutor_email,
        notifPantalla: tk.e_pantalla,
        habilitaEmail: tk.e_habilita_email,
        emailNotif: tk.e_email_notif,
        notifNuevo: tk.e_notif_nuevo,
        notifEstado: tk.e_notif_estado,
        notifComentario: tk.e_notif_com,
        notifAsignacion: tk.e_notif_asignacion
      }
    ].filter((dest) => dest.id && dest.id !== usuarioOrigenId);

    for (const dest of destinatarios) {
      if (dest.notifPantalla) {
        const tipoNotif = tipo === 'cambio_estado' ? 'info' : tipo === 'nuevo' ? 'success' : 'warning';
        await client.query(`
          INSERT INTO notificaciones (usuario_id, ticket_id, mensaje, tipo)
          VALUES ($1, $2, $3, $4)
        `, [dest.id, ticketId, mensaje, tipoNotif]);
      }

      const mailDest = dest.emailNotif || dest.email;
      const debeMailNuevo = tipo === 'nuevo' && dest.notifNuevo;
      const debeMailEstado = tipo === 'cambio_estado' && dest.notifEstado;
      const debeMailCom = tipo === 'comentario' && dest.notifComentario;
      const debeMailAsignacion = tipo === 'asignacion' && dest.notifAsignacion;

      if (mailDest && dest.habilitaEmail && (debeMailNuevo || debeMailEstado || debeMailCom || debeMailAsignacion)) {
        try {
          await enviarMail({
            to: mailDest,
            subject: `[Ticket #${tk.nro_ticket}] ${mensaje}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto">
                <div style="background:#1e40af;color:white;padding:20px;border-radius:10px 10px 0 0">
                  <h2 style="margin:0">Sistema de Tickets</h2>
                </div>
                <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">
                  <p>Hola <strong>${escapeHtml(dest.nombre)}</strong>,</p>
                  <p>${escapeHtml(mensaje)}</p>
                  ${renderTicketBox(tk)}
                </div>
              </div>
            `,
            silentIfUnavailable: true
          });
        } catch (error) {
          console.error('Error enviando notificacion por mail:', error.message);
        }
      }
    }
  } finally {
    client.release();
  }
}

module.exports = {
  enviarMail,
  enviarReporteTicket,
  notificarTicket
};
