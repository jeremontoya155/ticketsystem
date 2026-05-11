require('dotenv').config();

const endpoint = process.env.WHATSAPP_TEST_URL || 'http://localhost:3000/api/webhooks/whatsapp';
const token = process.env.WHATSAPP_WEBHOOK_TOKEN || '';

async function main() {
  const payload = {
    provider: 'script-prueba',
    messageId: `test-wsp-${Date.now()}`,
    phone: process.env.WHATSAPP_TEST_PHONE || '+54 9 351 555 0123',
    name: process.env.WHATSAPP_TEST_NAME || 'Cliente WhatsApp Demo',
    text: process.env.WHATSAPP_TEST_TEXT || 'Hola, necesito abrir un reclamo porque el sistema no me deja cerrar una recepcion. Es urgente para poder facturar.',
    reference: process.env.WHATSAPP_TEST_REFERENCE || 'WSP-DEMO-001',
    process: process.env.WHATSAPP_TEST_PROCESS || 'recepcion'
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });

  const body = await response.text();
  console.log(`POST ${endpoint}`);
  console.log(`Status: ${response.status}`);
  console.log(body);

  if (!response.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
