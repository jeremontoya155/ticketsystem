require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { initializeDatabase } = require('../config/init-db');

const DEFAULT_PASSWORD = process.env.SEED_E2E_PASSWORD || 'password';

const clients = [
  {
    key: 'alfa',
    nombre: 'Alfa Retail S.A.',
    contacto_nombre: 'Lucia Perez',
    email: 'contacto@alfaretail.com',
    telefono: '+54 9 351 555 1101',
    notas: 'Cliente foco soporte operativo'
  },
  {
    key: 'beta',
    nombre: 'Beta Salud SRL',
    contacto_nombre: 'Carlos Diaz',
    email: 'mesa@betasalud.com',
    telefono: '+54 9 351 555 2202',
    notas: 'Cliente foco desarrollo e integraciones'
  },
  {
    key: 'gamma',
    nombre: 'Gamma Logistica',
    contacto_nombre: 'Marta Ruiz',
    email: 'soporte@gammalogistica.com',
    telefono: '+54 9 351 555 3303',
    notas: 'Cliente mixto soporte/desarrollo'
  }
];

const users = [
  { nombre: 'Admin General', email: 'admin@empresa.com', rol: 'admin' },
  { nombre: 'Admin Soporte', email: 'admin.soporte@empresa.com', rol: 'admin_soporte' },
  { nombre: 'Admin Desarrollo', email: 'admin.desarrollo@empresa.com', rol: 'admin_desarrollo' },
  { nombre: 'Tecnico Soporte 1', email: 'soporte1@empresa.com', rol: 'tecnico_soporte' },
  { nombre: 'Tecnico Soporte 2', email: 'soporte2@empresa.com', rol: 'tecnico_soporte' },
  { nombre: 'Tecnico Desarrollo 1', email: 'dev1@empresa.com', rol: 'tecnico_desarrollo' },
  { nombre: 'Tecnico Desarrollo 2', email: 'dev2@empresa.com', rol: 'tecnico_desarrollo' }
];

const clientUsers = [
  {
    nombre: 'Cliente Alfa',
    email: 'cliente.alfa@alfaretail.com',
    rol: 'cliente',
    clientKey: 'alfa'
  },
  {
    nombre: 'Cliente Beta',
    email: 'cliente.beta@betasalud.com',
    rol: 'cliente',
    clientKey: 'beta'
  },
  {
    nombre: 'Cliente Gamma',
    email: 'cliente.gamma@gammalogistica.com',
    rol: 'cliente',
    clientKey: 'gamma'
  }
];

const tickets = [
  {
    nro_ticket: 99100,
    clientKey: 'alfa',
    asunto: 'Error al cerrar recepcion',
    reclamo: 'Al cerrar la recepcion aparece error 500 y no deja continuar.',
    observacion: 'Reportado por supervisor de turno.',
    prioridad: 'Alta',
    estado: 'Pendiente',
    canal_origen: 'whatsapp',
    proceso: 'recepcion',
    bolsa_asignada: 'soporte',
    referencia_externa: 'WSP-ALFA-001',
    origen_contacto: 'Lucia Perez',
    origen_email: 'contacto@alfaretail.com',
    origen_telefono: '+54 9 351 555 1101',
    receptorEmail: 'soporte1@empresa.com',
    ejecutorEmail: 'soporte1@empresa.com'
  },
  {
    nro_ticket: 99101,
    clientKey: 'alfa',
    asunto: 'Impresion lenta en caja',
    reclamo: 'La impresion de ticket fiscal demora mas de 25 segundos en caja 2.',
    observacion: 'Se reinicio equipo sin cambios.',
    prioridad: 'Media',
    estado: 'En Proceso',
    canal_origen: 'web',
    proceso: 'operacion',
    bolsa_asignada: 'soporte',
    referencia_externa: 'WEB-ALFA-010',
    origen_contacto: 'Cliente Alfa',
    origen_email: 'cliente.alfa@alfaretail.com',
    origen_telefono: '+54 9 351 555 1101',
    receptorEmail: 'soporte2@empresa.com',
    ejecutorEmail: 'soporte2@empresa.com'
  },
  {
    nro_ticket: 99102,
    clientKey: 'beta',
    asunto: 'API devuelve 401 en integracion',
    reclamo: 'La API de remitos devuelve 401 aun con token vigente.',
    observacion: 'Podria estar venciendo firma HMAC antes de tiempo.',
    prioridad: 'Urgente',
    estado: 'En Proceso',
    canal_origen: 'mail',
    proceso: 'desarrollo',
    bolsa_asignada: 'desarrollo',
    referencia_externa: 'MAIL-BETA-020',
    origen_contacto: 'Carlos Diaz',
    origen_email: 'mesa@betasalud.com',
    origen_telefono: '+54 9 351 555 2202',
    receptorEmail: 'admin.desarrollo@empresa.com',
    ejecutorEmail: 'dev1@empresa.com'
  },
  {
    nro_ticket: 99103,
    clientKey: 'beta',
    asunto: 'Consulta de stock incompleta',
    reclamo: 'En movil no aparecen productos con variante color.',
    observacion: 'Parece bug de serializacion.',
    prioridad: 'Alta',
    estado: 'Pendiente',
    canal_origen: 'whatsapp',
    proceso: 'desarrollo',
    bolsa_asignada: 'desarrollo',
    referencia_externa: 'WSP-BETA-021',
    origen_contacto: 'Carlos Diaz',
    origen_email: 'mesa@betasalud.com',
    origen_telefono: '+54 9 351 555 2202',
    receptorEmail: 'admin.desarrollo@empresa.com',
    ejecutorEmail: 'dev2@empresa.com'
  },
  {
    nro_ticket: 99104,
    clientKey: 'gamma',
    asunto: 'No sincroniza choferes',
    reclamo: 'La app de choferes no sincroniza viajes desde ayer.',
    observacion: 'Afecta despacho de ultima milla.',
    prioridad: 'Urgente',
    estado: 'Resuelto',
    canal_origen: 'mail',
    proceso: 'operacion',
    bolsa_asignada: 'soporte',
    referencia_externa: 'MAIL-GAMMA-030',
    origen_contacto: 'Marta Ruiz',
    origen_email: 'soporte@gammalogistica.com',
    origen_telefono: '+54 9 351 555 3303',
    receptorEmail: 'admin.soporte@empresa.com',
    ejecutorEmail: 'soporte1@empresa.com'
  },
  {
    nro_ticket: 99105,
    clientKey: 'gamma',
    asunto: 'Reporte mensual con totales mal',
    reclamo: 'Los totales de facturacion del reporte mensual no coinciden con dashboard.',
    observacion: 'Necesita revision en capa SQL del reporte.',
    prioridad: 'Alta',
    estado: 'Cerrado',
    canal_origen: 'web',
    proceso: 'desarrollo',
    bolsa_asignada: 'desarrollo',
    referencia_externa: 'WEB-GAMMA-031',
    origen_contacto: 'Cliente Gamma',
    origen_email: 'cliente.gamma@gammalogistica.com',
    origen_telefono: '+54 9 351 555 3303',
    receptorEmail: 'admin.desarrollo@empresa.com',
    ejecutorEmail: 'dev1@empresa.com'
  }
];

const comments = [
  {
    nro_ticket: 99100,
    autorEmail: 'admin.soporte@empresa.com',
    comentario: 'Caso recibido en bolsa soporte. Estamos validando logs de API.',
    tipo: 'comentario',
    visible_cliente: true
  },
  {
    nro_ticket: 99100,
    autorEmail: 'soporte1@empresa.com',
    comentario: 'Analisis interno: posible timeout en servicio de facturacion.',
    tipo: 'comentario',
    visible_cliente: false
  },
  {
    nro_ticket: 99102,
    autorEmail: 'dev1@empresa.com',
    comentario: 'Se identifico validacion extra de firma en middleware auth.',
    tipo: 'comentario',
    visible_cliente: false
  },
  {
    nro_ticket: 99102,
    autorEmail: 'admin.desarrollo@empresa.com',
    comentario: 'Se aplico fix y se pide confirmar del lado cliente.',
    tipo: 'cambio_estado',
    visible_cliente: true
  }
];

async function upsertClient(db, clientData) {
  const existing = await db.query(
    'SELECT id FROM clientes WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [clientData.email]
  );

  if (existing.rows[0]) {
    await db.query(`
      UPDATE clientes
      SET
        nombre = $1,
        contacto_nombre = $2,
        telefono = $3,
        notas = $4
      WHERE id = $5
    `, [
      clientData.nombre,
      clientData.contacto_nombre,
      clientData.telefono,
      clientData.notas,
      existing.rows[0].id
    ]);

    return existing.rows[0].id;
  }

  const created = await db.query(`
    INSERT INTO clientes (nombre, contacto_nombre, email, telefono, notas)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [
    clientData.nombre,
    clientData.contacto_nombre,
    clientData.email,
    clientData.telefono,
    clientData.notas
  ]);

  return created.rows[0].id;
}

async function upsertUser(db, userData, clientId = null) {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const res = await db.query(`
    INSERT INTO usuarios (nombre, email, password, rol, cliente_id, activo, notif_email, notif_pantalla)
    VALUES ($1, $2, $3, $4, $5, true, true, true)
    ON CONFLICT (email)
    DO UPDATE SET
      nombre = EXCLUDED.nombre,
      rol = EXCLUDED.rol,
      cliente_id = EXCLUDED.cliente_id,
      activo = true
    RETURNING id
  `, [userData.nombre, userData.email, hash, userData.rol, clientId]);

  const userId = res.rows[0].id;
  await db.query(`
    INSERT INTO config_mail (
      usuario_id, email_notif, notif_nuevo_ticket, notif_cambio_estado, notif_nuevo_comentario, notif_asignacion
    ) VALUES ($1, $2, true, true, true, true)
    ON CONFLICT (usuario_id)
    DO UPDATE SET
      email_notif = EXCLUDED.email_notif,
      notif_nuevo_ticket = EXCLUDED.notif_nuevo_ticket,
      notif_cambio_estado = EXCLUDED.notif_cambio_estado,
      notif_nuevo_comentario = EXCLUDED.notif_nuevo_comentario,
      notif_asignacion = EXCLUDED.notif_asignacion,
      updated_at = NOW()
  `, [userId, userData.email]);

  return userId;
}

async function upsertTicket(db, ticketData, maps) {
  const clientId = maps.clients.get(ticketData.clientKey);
  const receptorId = maps.usersByEmail.get(ticketData.receptorEmail) || null;
  const ejecutorId = maps.usersByEmail.get(ticketData.ejecutorEmail) || receptorId;

  const res = await db.query(`
    INSERT INTO tickets (
      nro_ticket, cliente_id, asunto, reclamo, observacion, prioridad, estado,
      canal_origen, proceso, bolsa_asignada, referencia_externa,
      origen_contacto, origen_email, origen_telefono,
      receptor_id, ejecutor_id, fecha_creacion, fecha_asignacion, dias_transcurridos
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11,
      $12, $13, $14,
      $15, $16, NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days', 5
    )
    ON CONFLICT (nro_ticket)
    DO UPDATE SET
      cliente_id = EXCLUDED.cliente_id,
      asunto = EXCLUDED.asunto,
      reclamo = EXCLUDED.reclamo,
      observacion = EXCLUDED.observacion,
      prioridad = EXCLUDED.prioridad,
      estado = EXCLUDED.estado,
      canal_origen = EXCLUDED.canal_origen,
      proceso = EXCLUDED.proceso,
      bolsa_asignada = EXCLUDED.bolsa_asignada,
      referencia_externa = EXCLUDED.referencia_externa,
      origen_contacto = EXCLUDED.origen_contacto,
      origen_email = EXCLUDED.origen_email,
      origen_telefono = EXCLUDED.origen_telefono,
      receptor_id = EXCLUDED.receptor_id,
      ejecutor_id = EXCLUDED.ejecutor_id,
      updated_at = NOW()
    RETURNING id
  `, [
    ticketData.nro_ticket,
    clientId,
    ticketData.asunto,
    ticketData.reclamo,
    ticketData.observacion,
    ticketData.prioridad,
    ticketData.estado,
    ticketData.canal_origen,
    ticketData.proceso,
    ticketData.bolsa_asignada,
    ticketData.referencia_externa,
    ticketData.origen_contacto,
    ticketData.origen_email,
    ticketData.origen_telefono,
    receptorId,
    ejecutorId
  ]);

  return res.rows[0].id;
}

async function ensureComment(db, commentData, maps) {
  const ticketId = maps.ticketsByNumber.get(commentData.nro_ticket);
  const userId = maps.usersByEmail.get(commentData.autorEmail) || null;
  if (!ticketId) {
    return;
  }

  const exists = await db.query(
    'SELECT id FROM comentarios WHERE ticket_id = $1 AND comentario = $2 LIMIT 1',
    [ticketId, commentData.comentario]
  );

  if (exists.rows[0]) {
    await db.query(`
      UPDATE comentarios
      SET tipo = $1, visible_cliente = $2
      WHERE id = $3
    `, [commentData.tipo, commentData.visible_cliente, exists.rows[0].id]);
    return;
  }

  await db.query(`
    INSERT INTO comentarios (ticket_id, usuario_id, comentario, tipo, visible_cliente)
    VALUES ($1, $2, $3, $4, $5)
  `, [ticketId, userId, commentData.comentario, commentData.tipo, commentData.visible_cliente]);
}

async function seedE2E() {
  let db;

  try {
    await initializeDatabase();
    db = await pool.connect();
    await db.query('BEGIN');

    const maps = {
      clients: new Map(),
      usersByEmail: new Map(),
      ticketsByNumber: new Map()
    };

    for (const clientData of clients) {
      const id = await upsertClient(db, clientData);
      maps.clients.set(clientData.key, id);
    }

    for (const userData of users) {
      const id = await upsertUser(db, userData, null);
      maps.usersByEmail.set(userData.email, id);
    }

    for (const userData of clientUsers) {
      const clientId = maps.clients.get(userData.clientKey) || null;
      const id = await upsertUser(db, userData, clientId);
      maps.usersByEmail.set(userData.email, id);
    }

    for (const ticketData of tickets) {
      const id = await upsertTicket(db, ticketData, maps);
      maps.ticketsByNumber.set(ticketData.nro_ticket, id);
    }

    for (const commentData of comments) {
      await ensureComment(db, commentData, maps);
    }

    await db.query('COMMIT');

    console.log('Seed E2E completado.');
    console.log(`Clientes: ${clients.length}`);
    console.log(`Usuarios internos: ${users.length}`);
    console.log(`Usuarios cliente: ${clientUsers.length}`);
    console.log(`Tickets: ${tickets.length}`);
    console.log(`Comentarios: ${comments.length}`);
    console.log(`Password para usuarios seed: ${DEFAULT_PASSWORD}`);
  } catch (error) {
    if (db) {
      await db.query('ROLLBACK');
    }
    console.error(`Error en seed E2E: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (db) {
      db.release();
    }
    await pool.end();
  }
}

if (require.main === module) {
  seedE2E();
}

module.exports = { seedE2E };
