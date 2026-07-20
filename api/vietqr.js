module.exports = async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error:'Method not allowed' });
  const parsed=new URL(request.url||'/api/vietqr','https://local.invalid'),query=request.query||Object.fromEntries(parsed.searchParams.entries());
  const bank=String(query.bank||parsed.searchParams.get('bank')||'').trim(),account=String(query.account||parsed.searchParams.get('account')||'').replace(/\s/g,''),amount=Number(query.amount||parsed.searchParams.get('amount')),info=String(query.info||parsed.searchParams.get('info')||'').trim(),name=String(query.name||parsed.searchParams.get('name')||'').trim();
  if(!/^[A-Za-z0-9]{2,20}$/.test(bank)||!/^[0-9]{5,30}$/.test(account)||!Number.isSafeInteger(amount)||amount<1000||amount>1000000000||!/^[A-Za-z0-9 ._-]{3,50}$/.test(info)||name.length>150) return response.status(400).json({error:'Invalid QR parameters'});
  const upstreamUrl=`https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(account)}-compact2.png?amount=${encodeURIComponent(amount)}&addInfo=${encodeURIComponent(info)}&accountName=${encodeURIComponent(name)}`;
  let timeout;
  try {
    const controller=new AbortController();timeout=setTimeout(()=>controller.abort(),12000);
    const upstream=await fetch(upstreamUrl,{headers:{Accept:'image/png','User-Agent':'Mozilla/5.0 CafeCCP-VietQR/1.0'},signal:controller.signal});
    clearTimeout(timeout);
    const contentType=upstream.headers.get('content-type')||'';
    if(!upstream.ok||!contentType.startsWith('image/')) return redirectToVietQr_(response,upstreamUrl);
    const bytes=Buffer.from(await upstream.arrayBuffer());
    response.setHeader('Content-Type','image/png');
    response.setHeader('Cache-Control','public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    response.setHeader('X-Content-Type-Options','nosniff');
    return response.status(200).send(bytes);
  } catch (_) { if(timeout)clearTimeout(timeout);return redirectToVietQr_(response,upstreamUrl); }
};

function redirectToVietQr_(response,url){response.statusCode=302;response.setHeader('Location',url);response.setHeader('Cache-Control','no-store');return response.end();}
