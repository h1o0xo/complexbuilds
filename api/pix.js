/**
 * Vercel Serverless Function — SigiloPay Pix
 * POST /api/pix
 *
 * Body: { name, email, phone, document, qty }
 * Env:  SIGILOPAY_PUBLIC_KEY, SIGILOPAY_SECRET_KEY
 */

const SIGILOPAY_ENDPOINT = 'https://app.sigilopay.com.br/api/v1/gateway/pix/receive';
const UNIT_PRICE = 127.90;

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || 'localhost';
  return `${proto}://${host}`;
}

function generateIdentifier() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CB-${ts}-${rand}`;
}

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const publicKey = process.env.SIGILOPAY_PUBLIC_KEY;
  const secretKey = process.env.SIGILOPAY_SECRET_KEY;

  if (!publicKey || !secretKey) {
    console.error('[pix] Missing SIGILOPAY_PUBLIC_KEY or SIGILOPAY_SECRET_KEY');
    return res.status(500).json({
      errorCode: 'GATEWAY_NOT_CONFIGURED',
      message: 'Gateway de pagamento não configurado. Entre em contato com o suporte.',
    });
  }

  const { name, email, phone, document, qty = 1, address = {} } = req.body || {};

  // Validate required fields
  const missing = [];
  if (!name)     missing.push('name');
  if (!email)    missing.push('email');
  if (!phone)    missing.push('phone');
  if (!document) missing.push('document');

  if (missing.length) {
    return res.status(400).json({
      errorCode: 'MISSING_FIELDS',
      message: 'Campos obrigatórios ausentes.',
      details: missing,
    });
  }

  const quantity = Math.max(1, Math.min(10, parseInt(qty, 10) || 1));
  const amount   = parseFloat((UNIT_PRICE * quantity).toFixed(2));
  const identifier = generateIdentifier();
  const callbackUrl = `${getBaseUrl(req)}/api/callback`;

  const metadata = {
    customerDoc: document,
    phone,
    ...(address.cep && { address: JSON.stringify(address) }),
  };

  const payload = {
    identifier,
    amount,
    client: { name, email, phone, document },
    products: [
      {
        id: 'kit-ferramentas-226-complexbuilds',
        name: 'Kit de Ferramentas 226 Peças com Parafusadeira 12V — ComplexBuilds',
        quantity,
        price: UNIT_PRICE,
      },
    ],
    callbackUrl,
    metadata,
  };

  let response;
  try {
    response = await fetch(SIGILOPAY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-public-key': publicKey,
        'x-secret-key': secretKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[pix] Network error calling SigiloPay:', err);
    return res.status(502).json({
      errorCode: 'GATEWAY_UNREACHABLE',
      message: 'Não foi possível conectar ao gateway de pagamento. Tente novamente.',
    });
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return res.status(502).json({
      errorCode: 'INVALID_GATEWAY_RESPONSE',
      message: 'Resposta inválida do gateway.',
    });
  }

  if (!response.ok) {
    console.error('[pix] SigiloPay error:', response.status, data);
    return res.status(response.status).json({
      errorCode: data.errorCode || 'GATEWAY_ERROR',
      message: data.message || 'Erro ao gerar cobrança Pix.',
      details: data.details,
    });
  }

  // Return only what the frontend needs
  return res.status(200).json({
    transactionId: data.transactionId,
    status: data.status,
    identifier,
    amount,
    pix: {
      code:  data.pix?.code  || null,
      image: data.pix?.image || null,
    },
  });
}
