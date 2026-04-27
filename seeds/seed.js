require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const { pool } = require('../config/db');
const { initializeDatabase } = require('../config/init-db');

async function loadTickets() {
  const ticketsPath = path.join(__dirname, 'tickets.json');
  const rawContent = await fs.readFile(ticketsPath, 'utf8');
  const sanitizedContent = rawContent.replace(/:\*+(?=\s*[,}])/g, ':null');

  return JSON.parse(sanitizedContent);
}

async function seed() {
  let client;
  let exitCode = 0;

  try {
    await initializeDatabase();
    client = await pool.connect();
    const tickets = await loadTickets();
    console.log('Iniciando seed...');

    // Insertar clientes unicos
    const clientesMap = {};
    for (const t of tickets) {
      if (!clientesMap[t.cliente]) {
        clientesMap[t.cliente] = { nombre: t.nombre_cli, tipo: t.tipo_clien, nombre_tipo: t.nombre_tip };
      }
    }

    for (const [codigo, data] of Object.entries(clientesMap)) {
      await client.query(`
        INSERT INTO clientes (codigo_externo, nombre, tipo_cliente, nombre_tipo)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (codigo_externo) DO NOTHING
      `, [parseInt(codigo, 10), data.nombre, data.tipo, data.nombre_tipo]);
    }
    console.log(`${Object.keys(clientesMap).length} clientes procesados`);

    // Obtener IDs de usuarios
    const usersRes = await client.query('SELECT id, nombre FROM usuarios');
    const jeremias = usersRes.rows.find((u) => u.nombre.includes('Jeremias')) || usersRes.rows[0];
    const soporte = usersRes.rows.find((u) => u.nombre.includes('Soporte')) || usersRes.rows[0];

    // Insertar tickets
    let count = 0;
    for (const t of tickets) {
      const clienteRes = await client.query(
        'SELECT id FROM clientes WHERE codigo_externo = $1',
        [t.cliente]
      );
      const clienteId = clienteRes.rows[0]?.id;

      await client.query(`
        INSERT INTO tickets (
          nro_ticket, cliente_id, reclamo, observacion, estado, prioridad,
          tipo_ticket, tipo_cliente_nombre, receptor_id, ejecutor_id,
          fecha_creacion, fecha_asignacion, dias_transcurridos, cant_archivos, tc
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (nro_ticket) DO NOTHING
      `, [
        t.tckt, clienteId, t.reclamo, t.observacio || '',
        t.estado || 'Pendiente', t.prioridad || 'Media',
        t.nombre_ti1, t.nombre_tip,
        soporte.id, jeremias.id,
        t.fecha_y_ho, t.fecha_asig,
        t.dias_trans, t.cant_archi, t.tc
      ]);
      count++;
    }
    console.log(`${count} tickets procesados`);

    // Config mail para cada usuario
    const allUsers = await client.query('SELECT id FROM usuarios');
    for (const u of allUsers.rows) {
      await client.query(`
        INSERT INTO config_mail (usuario_id, email_notif, notif_nuevo_ticket, notif_cambio_estado, notif_nuevo_comentario, notif_asignacion)
        VALUES ($1, '', true, true, true, true)
        ON CONFLICT (usuario_id) DO NOTHING
      `, [u.id]);
    }
    console.log('Configuracion de mail creada');
    console.log('Seed completado');
  } catch (err) {
    exitCode = 1;
    console.error('Error en seed:', err.message);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
    process.exit(exitCode);
  }
}

seed();
