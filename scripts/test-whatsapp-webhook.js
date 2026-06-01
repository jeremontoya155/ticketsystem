require('dotenv').config();

const endpoint = process.env.WHATSAPP_TEST_URL || 'http://localhost:3000/api/webhooks/whatsapp';
const authEndpoint = process.env.WHATSAPP_TEST_AUTH_URL || 'http://localhost:3000/api/auth/whatsapp';
const envToken = process.env.WHATSAPP_AUTH_TOKEN || process.env.WHATSAPP_WEBHOOK_TOKEN || '';

async function fetchWebhookToken() {
  if (envToken) {
    return envToken;
  }

  const user = process.env.WHATSAPP_AUTH_USER;
  const password = process.env.WHATSAPP_AUTH_PASS;
  if (!user || !password) {
    return '';
  }

  const response = await fetch(authEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user, password })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.ok) {
    throw new Error(`No se pudo autenticar contra ${authEndpoint}: ${payload.error || response.status}`);
  }

  return payload.token || '';
}

async function main() {
  const token = await fetchWebhookToken();
  const dryRun = String(process.env.WHATSAPP_TEST_DRY_RUN || 'true') !== 'false';

  const payload = {
    provider: 'script-prueba',
    messageId: `test-wsp-${Date.now()}`,
    phone: process.env.WHATSAPP_TEST_PHONE || '+54 9 351 555 0123',
    name: process.env.WHATSAPP_TEST_NAME || 'Cliente WhatsApp Demo',
    company: process.env.WHATSAPP_TEST_COMPANY || 'Empresa Demo SA',
    clientCode: process.env.WHATSAPP_TEST_CLIENT_CODE ? parseInt(process.env.WHATSAPP_TEST_CLIENT_CODE, 10) : undefined,
    text: process.env.WHATSAPP_TEST_TEXT || 'Hola, necesito abrir un reclamo porque el sistema no me deja cerrar una recepcion. Es urgente para poder facturar.',
    reference: process.env.WHATSAPP_TEST_REFERENCE || 'WSP-DEMO-001',
    process: process.env.WHATSAPP_TEST_PROCESS || 'recepcion',
    dryRun
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
  console.log(`Modo: ${dryRun ? 'evaluacion (sin crear ticket)' : 'creacion real'}`);
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
