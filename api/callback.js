/**
 * Vercel Serverless Function — SigiloPay Callback
 * POST /api/callback
 *
 * Receives payment status updates from SigiloPay.
 * Extend this function to update your database, send emails, etc.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    transactionId,
    identifier,
    status,
    amount,
    fee,
    order,
    pix,
    metadata,
  } = req.body || {};

  console.log('[callback] Payment status update:', {
    transactionId,
    identifier,
    status,
    amount,
    fee,
  });

  /**
   * Possible status values (extend as needed):
   *
   * PENDING   — aguardando pagamento
   * PAID      — pago
   * EXPIRED   — expirado
   * REFUNDED  — estornado
   * CANCELLED — cancelado
   */

  if (status === 'PAID') {
    // TODO: marcar pedido como pago no seu banco de dados
    // TODO: enviar e-mail/WhatsApp de confirmação ao cliente
    console.log('[callback] ✓ Pagamento confirmado:', transactionId);
  }

  // Always return 200 so SigiloPay stops retrying
  return res.status(200).json({ received: true });
}
