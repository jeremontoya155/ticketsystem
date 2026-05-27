require('dotenv').config();
const { pool } = require('../config/db');

async function run() {
  const q1 = await pool.query("SELECT COUNT(*)::int AS total FROM tickets WHERE nro_ticket BETWEEN 99100 AND 99199");
  const q2 = await pool.query("SELECT nro_ticket, canal_origen, bolsa_asignada, estado, prioridad, origen_telefono, referencia_externa FROM tickets WHERE nro_ticket IN (99100,99101,99102,99103,99104,99105,99106) ORDER BY nro_ticket");
  const q3 = await pool.query("SELECT visible_cliente, COUNT(*)::int AS total FROM comentarios GROUP BY visible_cliente ORDER BY visible_cliente");
  const q4 = await pool.query("SELECT u.email, u.rol, c.nombre AS empresa FROM usuarios u LEFT JOIN clientes c ON c.id = u.cliente_id WHERE u.email IN ('cliente.alfa@alfaretail.com','cliente.beta@betasalud.com','cliente.gamma@gammalogistica.com','admin.soporte@empresa.com','admin.desarrollo@empresa.com') ORDER BY u.email");

  console.log('TICKETS_991xx_TOTAL=', q1.rows[0].total);
  console.log('TICKETS_RESUMEN=', JSON.stringify(q2.rows));
  console.log('COMENTARIOS_VISIBILIDAD=', JSON.stringify(q3.rows));
  console.log('USUARIOS_CLAVE=', JSON.stringify(q4.rows));
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
