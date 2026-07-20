module.exports = async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error:'Method not allowed' });
  const bank=String(request.query?.bank||'').trim(),account=String(request.query?.account||'').replace(/\s/g,''),amount=Number(request.query?.amount),info=String(request.query?.info||'').trim(),name=String(request.query?.name||'').trim();
  if(!/^[A-Za-z0-9]{2,20}$/.test(bank)||!/^[0-9]{5,30}$/.test(account)||!Number.isSafeInteger(amount)||amount<1000||amount>1000000000||!/^[A-Za-z0-9 ._-]{3,50}$/.test(info)||name.length>150) return response.status(400).json({error:'Invalid QR parameters'});
  const upstreamUrl=`https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(account)}-compact2.png?amount=${encodeURIComponent(amount)}&addInfo=${encodeURIComponent(info)}&accountName=${encodeURIComponent(name)}`;
  try {
    const upstream=await fetch(upstreamUrl,{headers:{Accept:'image/png'},signal:AbortSignal.timeout(12000)});
    const contentType=upstream.headers.get('content-type')||'';
    if(!upstream.ok||!contentType.startsWith('image/')) return response.status(502).json({error:'QR provider unavailable'});
    const bytes=Buffer.from(await upstream.arrayBuffer());
    response.setHeader('Content-Type','image/png');
    response.setHeader('Cache-Control','public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    response.setHeader('X-Content-Type-Options','nosniff');
    return response.status(200).send(bytes);
  } catch (_) { return response.status(502).json({error:'QR provider unavailable'}); }
};
