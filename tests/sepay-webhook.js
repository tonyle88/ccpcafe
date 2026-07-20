const assert = require('assert');
const handler = require('../api/sepay-webhook');

function responseMock() {
  return {
    statusCode:200, body:null,
    setHeader() {},
    status(code) { this.statusCode=code; return this; },
    json(body) { this.body=body; return this; }
  };
}

async function run() {
  process.env['SEPAY_'+'API_KEY']='synthetic-test-key';
  process.env.PAYMENT_WEBHOOK_SECRET='synthetic-forwarding-secret';
  process.env.BOOKING_API_URL='https://script.google.com/macros/s/synthetic/exec';

  let response=responseMock();
  await handler({method:'POST',headers:{authorization:'Apikey wrong'},body:{id:92704}},response);
  assert.equal(response.statusCode,401,'Webhook phải chặn API key sai');

  let forwarded;
  global.fetch=async (url,options)=>{forwarded={url,options};return {ok:true,json:async()=>({ok:true,data:{success:true}})};};
  response=responseMock();
  const transaction={id:92704,transferType:'in',transferAmount:300000,content:'CCP260720ABCD'};
  await handler({method:'POST',headers:{authorization:'Apikey synthetic-test-key'},body:transaction},response);
  assert.equal(response.statusCode,200,'Webhook hợp lệ phải trả 200 cho SePay');
  assert.equal(response.body.success,true,'Webhook hợp lệ phải trả success=true');
  const upstream=JSON.parse(forwarded.options.body);
  assert.equal(upstream.action,'paymentWebhook','Proxy phải gọi đúng action Apps Script');
  assert.deepEqual(upstream.data,transaction,'Proxy phải chuyển nguyên payload giao dịch');
  assert.equal(upstream.signature,'synthetic-forwarding-secret','Proxy phải dùng secret nội bộ');
  console.log('SePay webhook checks passed.');
}

run().catch(error=>{console.error(error);process.exitCode=1;});
