require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { initializeDatabase } = require('../config/init-db');

function getConfig() {
  return {
    empresaNombre: process.env.CLIENTE_DEMO_NOMBRE_EMPRESA || 'Cliente Demo S.A.',
    empresaEmail: process.env.CLIENTE_DEMO_EMAIL || 'cliente.demo@empresa.com',
    empresaContacto: process.env.CLIENTE_DEMO_CONTACTO || 'Contacto Demo',
    empresaTelefono: process.env.CLIENTE_DEMO_TELEFONO || '',
    usuarioNombre: process.env.CLIENTE_DEMO_USUARIO_NOMBRE || 'Usuario Cliente Demo',
    usuarioEmail: process.env.CLIENTE_DEMO_USUARIO_EMAIL || 'usuario.cliente@empresa.com',
    usuarioPassword: process.env.CLIENTE_DEMO_USUARIO_PASSWORD || ''
  };
}

async function ensureClient(client, config) {
  const existing = await client.query(
    'SELECT id FROM clientes WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [config.empresaEmail]
  );

  if (existing.rows[0]) {
    await client.query(`
      UPDATE clientes
      SET nombre = $1, contacto_nombre = $2, telefono = $3
      WHERE id = $4
    `, [config.empresaNombre, config.empresaContacto, config.empresaTelefono || null, existing.rows[0].id]);

    return existing.rows[0].id;
  }

  const created = await client.query(`
    INSERT INTO clientes (nombre, contacto_nombre, email, telefono)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [config.empresaNombre, config.empresaContacto, config.empresaEmail, config.empresaTelefono || null]);

  return created.rows[0].id;
}

async function ensureClientUser(client, config, clienteId) {
  const existing = await client.query(
    'SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [config.usuarioEmail]
  );

  const values = [
    config.usuarioNombre,
    config.usuarioEmail,
    'cliente',
    clienteId,
    true
  ];

  if (existing.rows[0]) {
    if (config.usuarioPassword) {
      const hash = await bcrypt.hash(config.usuarioPassword, 10);
      await client.query(`
        UPDATE usuarios
        SET nombre = $1, email = $2, rol = $3, cliente_id = $4, activo = $5, password = $6
        WHERE id = $7
      `, [...values, hash, existing.rows[0].id]);
    } else {
      await client.query(`
        UPDATE usuarios
        SET nombre = $1, email = $2, rol = $3, cliente_id = $4, activo = $5
        WHERE id = $6
      `, [...values, existing.rows[0].id]);
    }

    return { id: existing.rows[0].id, created: false };
  }

  if (!config.usuarioPassword) {
    throw new Error('Debes definir CLIENTE_DEMO_USUARIO_PASSWORD para crear el usuario cliente por primera vez.');
  }

  const hash = await bcrypt.hash(config.usuarioPassword, 10);
  const created = await client.query(`
    INSERT INTO usuarios (nombre, email, password, rol, cliente_id, activo)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [config.usuarioNombre, config.usuarioEmail, hash, 'cliente', clienteId, true]);

  return { id: created.rows[0].id, created: true };
}

async function main() {
  const config = getConfig();
  if (!config.usuarioPassword) {
    console.warn('Aviso: CLIENTE_DEMO_USUARIO_PASSWORD vacio. Solo se podra actualizar usuario existente.');
  }

  let client;
  try {
    await initializeDatabase();
    client = await pool.connect();
    await client.query('BEGIN');

    const clienteId = await ensureClient(client, config);
    const userResult = await ensureClientUser(client, config, clienteId);

    await client.query('COMMIT');

    console.log('Cliente y usuario preparados correctamente.');
    console.log(`Empresa: ${config.empresaNombre} (${config.empresaEmail})`);
    console.log(`Usuario: ${config.usuarioEmail}`);
    console.log(`Operacion usuario: ${userResult.created ? 'creado' : 'actualizado'}`);
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error(`Error preparando usuario cliente: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
