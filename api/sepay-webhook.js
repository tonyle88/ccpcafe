const crypto = require('crypto');

function secureEqual(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method !== 'POST') return response.status(405).json({ success:false, message:'Method not allowed' });

  const apiKey = process.env.SEPAY_API_KEY || '';
  const bookingApiUrl = process.env.BOOKING_API_URL || '';
  const forwardingSecret = process.env.PAYMENT_WEBHOOK_SECRET || '';
  if (!apiKey || !bookingApiUrl || !forwardingSecret) return response.status(503).json({ success:false, message:'Payment webhook is not configured' });
  if (!secureEqual(request.headers.authorization, `Apikey ${apiKey}`)) return response.status(401).json({ success:false, message:'Unauthorized' });

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const payloadBytes = Buffer.byteLength(JSON.stringify(body));
  if (!body.id || payloadBytes > 32768) return response.status(400).json({ success:false, message:'Invalid payload' });

  try {
    const upstream = await fetch(bookingApiUrl, {
      method:'POST',
      redirect:'follow',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body:JSON.stringify({ action:'paymentWebhook', data:body, signature:forwardingSecret })
    });
    const result = await upstream.json();
    if (!upstream.ok || !result.ok) return response.status(422).json({ success:false, message:result.error?.code || 'Payment reconciliation failed' });
    return response.status(200).json({ success:true });
  } catch (_) {
    return response.status(502).json({ success:false, message:'Payment service unavailable' });
  }
};
