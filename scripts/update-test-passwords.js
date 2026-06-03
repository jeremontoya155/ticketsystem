require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const TEST_USERS = [
  { email: 'jeremias@empresa.com', newPassword: 'Jeremias2025' },
  { email: 'soporte@empresa.com',  newPassword: 'Soporte2025'  }
];

async function updatePasswords() {
  let client;
  try {
    client = await pool.connect();
    for (const u of TEST_USERS) {
      const hash = await bcrypt.hash(u.newPassword, 10);
      const res = await client.query(
        'UPDATE usuarios SET password = $1 WHERE email = $2 RETURNING nombre, email',
        [hash, u.email]
      );
      if (res.rows.length) {
        console.log(`✓ ${res.rows[0].nombre} (${res.rows[0].email}) → contraseña actualizada`);
      } else {
        console.warn(`! No se encontró usuario con email: ${u.email}`);
      }
    }
    console.log('\nListo. Credenciales en TEST_USERS.md');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

updatePasswords();
