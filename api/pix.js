/**
 * Vercel Serverless Function — PushinPay Pix
 * POST /api/pix
 *
 * Body: { name, email, phone, document, qty }
 * Env:  PUSHINPAY_SECRET_TOKEN
 */

const PUSHINPAY_ENDPOINT = 'http://api.pushinpay.com.br/api/pix/cashIn';
const UNIT_PRICE = 165; // Preço em Reais

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || 'localhost';
  return `${proto}://${host}`;
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

  // Agora usamos apenas o Token Secreto da PushinPay nas variáveis de ambiente
  const secretToken = process.env.PUSHINPAY_SECRET_TOKEN;

  if (!secretToken) {
    console.error('[pix] Missing PUSHINPAY_SECRET_TOKEN');
    return res.status(500).json({
      errorCode: 'GATEWAY_NOT_CONFIGURED',
      message: 'Gateway de pagamento não configurado. Entre em contato com o suporte.',
    });
  }

  const { name, email, phone, document, qty = 1 } = req.body || {};

  // Validação de campos obrigatórios
  const missing = [];
  if (!name)     missing.push('name');
  if (!document) missing.push('document');

  if (missing.length) {
    return res.status(400).json({
      errorCode: 'MISSING_FIELDS',
      message: 'Campos obrigatórios ausentes.',
      details: missing,
    });
  }

  const quantity = Math.max(1, Math.min(10, parseInt(qty, 10) || 1));
  
  // ATENÇÃO: PushinPay geralmente exige valores em CENTAVOS. 
  // Se R\$ 200,00 deve virar 20000, multiplicamos por 100.
  const amountInCentavos = Math.round(UNIT_PRICE * quantity * 100); 
  
  const callbackUrl = `${getBaseUrl(req)}/webhooks/pushinpay`;

  // Mapeamento exato para o Payload solicitado pela PushinPay
  const payload = {
    value: amountInCentavos,
    webhook_url: callbackUrl,
    expires_in: 3600, // 1 hora
    description: `Pedido de ${name} — ${quantity}x Kit`,
    player_name: name,
    player_doc: document.replace(/\D/g, ''), // Remove pontos e traços do CPF
    minor_verified: true
  };

  let response;
  try {
    response = await fetch(PUSHINPAY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secretToken}`, // Formato padrão Bearer Token
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[pix] Network error calling PushinPay:', err);
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
    console.error('[pix] PushinPay error:', response.status, data);
    return res.status(response.status).json({
      errorCode: 'GATEWAY_ERROR',
      message: data.message || 'Erro ao gerar cobrança Pix.',
      details: data,
    });
  }

  // Retorna formatado exatamente como o seu Front-end antigo esperava receber
  return res.status(200).json({
    transactionId: data.id, // ID da transação na PushinPay
    status: data.status || 'processing',
    amount: UNIT_PRICE * quantity,
    pix: {
      code:  data.qr_code || null,       // Linha "Copia e Cola" do Pix
      image: data.qr_code_base64 || null // Imagem Base64 do QR Code
    },
  });
}
