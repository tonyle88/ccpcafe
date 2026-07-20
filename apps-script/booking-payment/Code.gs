const BOOKING_HEADERS = ['Created At','Customer Name','Phone','Email','Package Code','Package Name','Preferred Date','Party Size','Topic','Order ID','Base Amount','Discount Amount','Final Amount','Currency','Status','Transfer Content','Payment Transaction ID','Paid Amount','Paid At','Owner Email','Idempotency Key','Last Updated At','Payment Mode'];
const BOOKING_SHEETS = { 'Bookings':BOOKING_HEADERS, 'Email Log':['Timestamp','Type','Recipient','Order ID','Status','Message'], 'Error Log':['Timestamp','Source','Action','Order ID','Message'] };
const PACKAGE_CATALOG = Object.freeze({ 'kham-pha':{name:'Gói Khám Phá',price:300000}, 'ket-noi':{name:'Gói Kết Nối',price:400000}, 'toan-dien':{name:'Gói Toàn Diện',price:550000}, '3in1':{name:'Tư Vấn 3-in-1 Đặc Biệt',price:550000} });

function doGet(e) {
  try {
    const action=String((e&&e.parameter&&e.parameter.action)||'health');
    if(action==='health') return bookingJson_(true,bookingHealth_());
    if(action==='checkPayment') return bookingJson_(true,checkPayment_(e.parameter.orderId));
    return bookingJson_(false,null,'NOT_FOUND','Action không tồn tại.');
  } catch(error) { return bookingJson_(false,null,error.code||'INTERNAL_ERROR',bookingSafe_(error)); }
}

function doPost(e) {
  try {
    const body=JSON.parse((e&&e.postData&&e.postData.contents)||'{}');
    if(body.action==='register') return bookingJson_(true,register_(body.data||{}));
    if(body.action==='manualConfirm') return bookingJson_(true,manualConfirm_(body.data||{}));
    if(body.action==='paymentWebhook') return bookingJson_(true,paymentWebhook_(body.data||{},body.signature));
    if(body.action==='getPaymentConfig') return bookingJson_(true,getPaymentConfig_(body.adminSecret));
    if(body.action==='savePaymentConfig') return bookingJson_(true,savePaymentConfig_(body.data||{},body.adminSecret));
    return bookingJson_(false,null,'NOT_FOUND','Action không tồn tại.');
  } catch(error) { logError_('api','post','',bookingSafe_(error)); return bookingJson_(false,null,error.code||'INTERNAL_ERROR',bookingSafe_(error)); }
}

function setupBookingSpreadsheet() { const ss=getBookingSpreadsheet_(); Object.keys(BOOKING_SHEETS).forEach(name=>bookingEnsureSheet_(ss,name,BOOKING_SHEETS[name])); return bookingHealth_(); }

function register_(data) {
  const clean=validateBooking_(data), pkg=PACKAGE_CATALOG[clean.packageCode];
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const spreadsheet=getBookingSpreadsheet_();
    bookingEnsureSheet_(spreadsheet,'Bookings',BOOKING_HEADERS);
    const sheet=spreadsheet.getSheetByName('Bookings');
    const existing=findBooking_('Idempotency Key',clean.idempotencyKey);
    if(existing) return publicOrder_(existing);
    const discountRate=clean.partySize===2?0.10:(clean.partySize>=3?0.15:0);
    const discount=Math.round(pkg.price*discountRate), finalAmount=pkg.price-discount;
    const orderId=createOrderId_();
    const properties=PropertiesService.getScriptProperties(), ownerEmail=properties.getProperty('OWNER_EMAIL')||Session.getEffectiveUser().getEmail()||'';
    const paymentMode=paymentMode_(properties);
    const record={
      'Created At':new Date(),'Customer Name':clean.name,'Phone':clean.phone,'Email':clean.email,'Package Code':clean.packageCode,'Package Name':pkg.name,
      'Preferred Date':clean.preferredDate,'Party Size':clean.partySize,'Topic':clean.topic,'Order ID':orderId,'Base Amount':pkg.price,'Discount Amount':discount,
      'Final Amount':finalAmount,'Currency':'VND','Status':'PENDING_PAYMENT','Transfer Content':orderId,'Payment Transaction ID':'','Paid Amount':'','Paid At':'',
      'Owner Email':ownerEmail,'Idempotency Key':clean.idempotencyKey,'Last Updated At':new Date(),'Payment Mode':paymentMode
    };
    sheet.appendRow(BOOKING_HEADERS.map(header=>record[header]));
    sendBookingEmails_(clean,pkg,orderId,finalAmount,ownerEmail);
    return { orderId:orderId, amount:finalAmount, currency:'VND', status:'PENDING_PAYMENT', paymentUrl:'payment.html?orderId='+encodeURIComponent(orderId) };
  } finally { lock.releaseLock(); }
}

function validateBooking_(data) {
  const rawPhone=String(data.phone||'').replace(/[\s().-]/g,''), normalizedPhone=/^0[35789][0-9]{8}$/.test(rawPhone)?'+84'+rawPhone.slice(1):(/^84[35789][0-9]{8}$/.test(rawPhone)?'+'+rawPhone:rawPhone);
  const clean={ name:String(data.name||'').trim(), phone:normalizedPhone, email:String(data.email||'').trim().toLowerCase(), packageCode:String(data.packageCode||''), preferredDate:String(data.preferredDate||''), partySize:Number(data.partySize||1), topic:String(data.topic||'').trim(), idempotencyKey:String(data.idempotencyKey||'') };
  if(clean.name.length<2||clean.name.length>100) throw bookingError_('VALIDATION_ERROR','Họ tên không hợp lệ.');
  if(!/^\+84[35789][0-9]{8}$/.test(clean.phone)) throw bookingError_('VALIDATION_ERROR','Số điện thoại Việt Nam không hợp lệ.');
  if(clean.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean.email)) throw bookingError_('VALIDATION_ERROR','Email không hợp lệ.');
  if(!PACKAGE_CATALOG[clean.packageCode]) throw bookingError_('PACKAGE_UNAVAILABLE','Gói dịch vụ không khả dụng.');
  const today=Utilities.formatDate(new Date(),'Asia/Ho_Chi_Minh','yyyy-MM-dd');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(clean.preferredDate)||clean.preferredDate<today) throw bookingError_('VALIDATION_ERROR','Ngày đặt lịch không hợp lệ hoặc đã ở trong quá khứ.');
  if(![1,2,3].includes(clean.partySize)) throw bookingError_('VALIDATION_ERROR','Số người không hợp lệ.');
  if(clean.topic.length>2000||clean.idempotencyKey.length<8||clean.idempotencyKey.length>100) throw bookingError_('VALIDATION_ERROR','Dữ liệu không hợp lệ.');
  return clean;
}

function createOrderId_() {
  for(let attempt=0;attempt<5;attempt++) {
    const suffix=Utilities.formatDate(new Date(),'Asia/Ho_Chi_Minh','yyMMdd')+Utilities.getUuid().replace(/-/g,'').slice(0,4).toUpperCase();
    const orderId='CCP'+suffix;
    if(!findBooking_('Order ID',orderId)) return orderId;
  }
  throw bookingError_('INTERNAL_ERROR','Không thể tạo mã đơn duy nhất.');
}
function normalizeOrderId_(value) { const orderId=String(value||'').trim().toUpperCase(); if(!/^CCP[0-9]{6}[A-F0-9]{4}$/.test(orderId)&&!/^CCP-[0-9]{8}-[A-F0-9]{32}$/.test(orderId)) throw bookingError_('ORDER_NOT_FOUND','Không tìm thấy đơn.'); return orderId; }
function checkPayment_(orderId) { const row=findBooking_('Order ID',normalizeOrderId_(orderId)); if(!row) throw bookingError_('ORDER_NOT_FOUND','Không tìm thấy đơn.'); return publicOrder_(row); }
function manualConfirm_(data) {
  const orderId=normalizeOrderId_(data.orderId), lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const row=findBooking_('Order ID',orderId,true);
    if(!row) throw bookingError_('ORDER_NOT_FOUND','Không tìm thấy đơn.');
    const current=String(row.object.Status||'');
    if(current==='PENDING_PAYMENT') {
      setBookingFields_(row,{'Status':'PAYMENT_REVIEW','Last Updated At':new Date()});
      return {orderId:orderId,status:'PAYMENT_REVIEW'};
    }
    if(['PAYMENT_REVIEW','PAID','CONFIRMED','COMPLETED'].includes(current)) return {orderId:orderId,status:current};
    throw bookingError_('INVALID_STATE','Đơn không thể chuyển sang chờ đối soát.');
  } finally { lock.releaseLock(); }
}

function paymentWebhook_(data,signature) {
  const properties=PropertiesService.getScriptProperties(), secret=properties.getProperty('PAYMENT_WEBHOOK_SECRET');
  if(!secret||signature!==secret) throw bookingError_('FORBIDDEN','Webhook không hợp lệ.');
  if(paymentMode_(properties)!=='sepay') throw bookingError_('INVALID_STATE','Đối soát SePay chưa được bật.');
  if(String(data.transferType||'').toLowerCase()!=='in') return {success:true,ignored:true};
  const transactionId=String(data.id||data.referenceCode||'').trim();
  if(!transactionId) throw bookingError_('VALIDATION_ERROR','Webhook thiếu mã giao dịch.');
  const duplicate=findBooking_('Payment Transaction ID',transactionId);
  if(duplicate) return {success:true,duplicate:true,orderId:duplicate['Order ID']};
  const text=[data.code,data.content,data.description].map(value=>String(value||'').toUpperCase()).join(' ');
  const match=text.match(/CCP[0-9]{6}[A-F0-9]{4}|CCP-[0-9]{8}-[A-F0-9]{32}/);
  if(!match) return {success:true,ignored:true};
  const orderId=normalizeOrderId_(match[0]), lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const row=findBooking_('Order ID',orderId,true);
    if(!row) return {success:true,ignored:true};
    if(findBooking_('Payment Transaction ID',transactionId)) return {success:true,duplicate:true,orderId:orderId};
    const expectedAccount=String(properties.getProperty('PAYMENT_ACCOUNT_NO')||'').replace(/\s/g,''), actualAccount=String(data.accountNumber||'').replace(/\s/g,'');
    const paidAmount=Number(data.transferAmount);
    if(expectedAccount&&actualAccount&&expectedAccount!==actualAccount) throw bookingError_('PAYMENT_MISMATCH','Tài khoản nhận không khớp.');
    if(!Number.isFinite(paidAmount)||paidAmount!==Number(row.object['Final Amount'])) throw bookingError_('PAYMENT_MISMATCH','Số tiền thanh toán không khớp.');
    const current=String(row.object.Status||'');
    if(['CANCELLED','EXPIRED'].includes(current)) throw bookingError_('INVALID_STATE','Đơn đã kết thúc.');
    if(!['PENDING_PAYMENT','PAYMENT_REVIEW','PAID','CONFIRMED','COMPLETED'].includes(current)) throw bookingError_('INVALID_STATE','Trạng thái đơn không hợp lệ.');
    if(!['PAID','CONFIRMED','COMPLETED'].includes(current)) setBookingFields_(row,{'Status':'PAID','Payment Transaction ID':transactionId,'Paid Amount':paidAmount,'Paid At':parseSePayDate_(data.transactionDate),'Last Updated At':new Date()});
    return {success:true,orderId:orderId,status:'PAID'};
  } finally { lock.releaseLock(); }
}

function parseSePayDate_(value) { const text=String(value||'').trim(); if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return new Date(); const parsed=new Date(text.replace(' ','T')+'+07:00'); return isNaN(parsed.getTime())?new Date():parsed; }
function paymentMode_(properties) { return String(properties.getProperty('PAYMENT_MODE')||'manual').toLowerCase()==='sepay'?'sepay':'manual'; }
function requireBookingAdmin_(secret) { const expected=PropertiesService.getScriptProperties().getProperty('BOOKING_ADMIN_SECRET')||''; if(expected.length<32||String(secret||'')!==expected) throw bookingError_('FORBIDDEN','Kết nối quản trị không hợp lệ.'); }
function getPaymentConfig_(secret) { requireBookingAdmin_(secret); const properties=PropertiesService.getScriptProperties(); return { mode:paymentMode_(properties), bankCode:properties.getProperty('PAYMENT_BANK_CODE')||'', bankName:properties.getProperty('PAYMENT_BANK_NAME')||'', accountName:properties.getProperty('PAYMENT_ACCOUNT_NAME')||'', accountNo:properties.getProperty('PAYMENT_ACCOUNT_NO')||'', publicSiteUrl:properties.getProperty('PUBLIC_SITE_URL')||'', webhookConfigured:!!properties.getProperty('PAYMENT_WEBHOOK_SECRET') }; }
function savePaymentConfig_(data,secret) {
  requireBookingAdmin_(secret);
  const clean={mode:String(data.mode||'manual').trim().toLowerCase(),bankCode:String(data.bankCode||'').trim(),bankName:String(data.bankName||'').trim(),accountName:String(data.accountName||'').trim(),accountNo:String(data.accountNo||'').replace(/\s/g,''),publicSiteUrl:String(data.publicSiteUrl||'').trim().replace(/\/$/,'')};
  if(!['manual','sepay'].includes(clean.mode)) throw bookingError_('VALIDATION_ERROR','Phương thức thanh toán không hợp lệ.');
  if(!/^[A-Za-z0-9]{2,20}$/.test(clean.bankCode)) throw bookingError_('VALIDATION_ERROR','Mã ngân hàng VietQR không hợp lệ.');
  if(clean.bankName.length<2||clean.bankName.length>100||clean.accountName.length<2||clean.accountName.length>150) throw bookingError_('VALIDATION_ERROR','Tên ngân hàng hoặc chủ tài khoản không hợp lệ.');
  if(!/^[0-9]{5,30}$/.test(clean.accountNo)) throw bookingError_('VALIDATION_ERROR','Số tài khoản chỉ gồm 5–30 chữ số.');
  if(clean.publicSiteUrl&&!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?(?:\/.*)?$/i.test(clean.publicSiteUrl)) throw bookingError_('VALIDATION_ERROR','PUBLIC_SITE_URL phải dùng HTTPS.');
  const properties=PropertiesService.getScriptProperties();
  properties.setProperties({'PAYMENT_MODE':clean.mode,'PAYMENT_BANK_CODE':clean.bankCode,'PAYMENT_BANK_NAME':clean.bankName,'PAYMENT_ACCOUNT_NAME':clean.accountName,'PAYMENT_ACCOUNT_NO':clean.accountNo,'PUBLIC_SITE_URL':clean.publicSiteUrl},false);
  return getPaymentConfig_(secret);
}
function paymentQrUrl_(row,properties) {
  const bankCode=String(properties.getProperty('PAYMENT_BANK_CODE')||'').trim(), accountNo=String(properties.getProperty('PAYMENT_ACCOUNT_NO')||'').replace(/\s/g,'');
  if(!bankCode||!accountNo) return '';
  const base='https://img.vietqr.io/image/'+encodeURIComponent(bankCode)+'-'+encodeURIComponent(accountNo)+'-compact2.png';
  return base+'?amount='+encodeURIComponent(Number(row['Final Amount']))+'&addInfo='+encodeURIComponent(row['Transfer Content'])+'&accountName='+encodeURIComponent(properties.getProperty('PAYMENT_ACCOUNT_NAME')||'');
}
function publicOrder_(record) { const row=record.object||record, properties=PropertiesService.getScriptProperties(), mode=String(row['Payment Mode']||paymentMode_(properties)); return { orderId:row['Order ID'], packageName:row['Package Name'], amount:Number(row['Final Amount']), currency:row.Currency, status:row.Status, transferContent:row['Transfer Content'], payment:{ mode:mode, qrUrl:paymentQrUrl_(row,properties), bankName:properties.getProperty('PAYMENT_BANK_NAME')||'', accountName:properties.getProperty('PAYMENT_ACCOUNT_NAME')||'', accountNo:properties.getProperty('PAYMENT_ACCOUNT_NO')||'' } }; }
function findBooking_(header,value,withMeta) { const sheet=getBookingSpreadsheet_().getSheetByName('Bookings'); if(!sheet||sheet.getLastRow()<2)return null; const values=sheet.getDataRange().getValues(), headers=values.shift(), index=headers.indexOf(header); if(index<0)return null; for(let i=0;i<values.length;i++)if(String(values[i][index])===String(value)){const object=headers.reduce((o,k,j)=>(o[k]=values[i][j],o),{});return withMeta?{object:object,sheet:sheet,rowNumber:i+2,headers:headers}:object;} return null; }
function setBookingFields_(record,updates) { const headers=record.headers||BOOKING_HEADERS; Object.keys(updates).forEach(header=>{const index=headers.indexOf(header);if(index>=0){record.sheet.getRange(record.rowNumber,index+1).setValue(updates[header]);record.object[header]=updates[header];}}); }
function sendBookingEmails_(clean,pkg,orderId,amount,ownerEmail) {
  try {
    const properties=PropertiesService.getScriptProperties(), siteUrl=String(properties.getProperty('PUBLIC_SITE_URL')||'').replace(/\/$/,'');
    const paymentUrl=/^https:\/\//i.test(siteUrl)?siteUrl+'/payment.html?orderId='+encodeURIComponent(orderId):'';
    const subject='✦ Clow Cat Patronus đã nhận đăng ký '+orderId;
    const plain='Chào '+clean.name+',\n\nĐăng ký '+pkg.name+' của bạn đã được ghi nhận.\nMã đơn: '+orderId+'\nNgày mong muốn: '+clean.preferredDate+'\nSố tiền: '+amount.toLocaleString('vi-VN')+' VND.\n\nVui lòng hoàn tất thanh toán theo hướng dẫn trên website. Chúng mình sẽ liên hệ xác nhận lịch trong vòng 24 giờ.\n\nClow Cat Patronus';
    MailApp.sendEmail({to:clean.email,subject:subject,body:plain,htmlBody:bookingCustomerEmailHtml_(clean,pkg,orderId,amount,paymentUrl),name:'Clow Cat Patronus'});
    logEmail_('customer',clean.email,orderId,'success','');
    if(ownerEmail){MailApp.sendEmail({to:ownerEmail,subject:'Booking mới '+orderId,body:'Khách: '+clean.name+'\nGói: '+pkg.name+'\nMã đơn: '+orderId+'\nNgày: '+clean.preferredDate+'\nSố tiền: '+amount.toLocaleString('vi-VN')+' VND',name:'Clow Cat Patronus Booking'});logEmail_('owner',ownerEmail,orderId,'success','');}
  } catch(error) { logEmail_('booking','',orderId,'error',bookingSafe_(error)); }
}
function bookingCustomerEmailHtml_(clean,pkg,orderId,amount,paymentUrl) {
  const name=bookingHtml_(clean.name),packageName=bookingHtml_(pkg.name),safeOrder=bookingHtml_(orderId),date=bookingHtml_(clean.preferredDate),amountText=bookingHtml_(amount.toLocaleString('vi-VN')+' ₫');
  const button=paymentUrl?'<tr><td style="padding:8px 32px 32px;text-align:center"><a href="'+bookingHtml_(paymentUrl)+'" style="display:inline-block;padding:14px 28px;border-radius:999px;background:#f0d080;color:#17132b;text-decoration:none;font-weight:700">Tiếp tục thanh toán →</a></td></tr>':'';
  return '<div style="margin:0;padding:28px 12px;background:#0d0b18;color:#f9f4e8;font-family:Georgia,serif"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:auto;border:1px solid #4b3e64;border-radius:24px;background:#181329"><tr><td style="padding:36px 32px 18px;text-align:center"><div style="color:#f0d080;font:700 12px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">✦ Clow Cat Patronus ✦</div><h1 style="margin:16px 0 8px;color:#fff;font-size:30px;line-height:1.2">Cảm ơn bạn đã tin tưởng Clow!</h1><p style="margin:0;color:#aaa3ba;line-height:1.7">Chào <strong style="color:#fff">'+name+'</strong>, đăng ký của bạn đã được ghi nhận.<br>Chúng mình sẽ liên hệ xác nhận lịch trong vòng 24 giờ.</p></td></tr><tr><td style="padding:14px 32px"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #3d334f;border-radius:16px;background:#121022"><tr><td style="padding:14px 18px;color:#aaa3ba">Mã đơn hàng</td><td style="padding:14px 18px;text-align:right;color:#f0d080;font-weight:700">'+safeOrder+'</td></tr><tr><td style="padding:14px 18px;border-top:1px solid #29233a;color:#aaa3ba">Gói dịch vụ</td><td style="padding:14px 18px;border-top:1px solid #29233a;text-align:right;color:#fff;font-weight:700">'+packageName+'</td></tr><tr><td style="padding:14px 18px;border-top:1px solid #29233a;color:#aaa3ba">Ngày mong muốn</td><td style="padding:14px 18px;border-top:1px solid #29233a;text-align:right;color:#fff">'+date+'</td></tr><tr><td style="padding:14px 18px;border-top:1px solid #29233a;color:#aaa3ba">Số tiền</td><td style="padding:14px 18px;border-top:1px solid #29233a;text-align:right;color:#f0d080;font-weight:700">'+amountText+'</td></tr></table></td></tr><tr><td style="padding:16px 32px;color:#aaa3ba;line-height:1.65;text-align:center">Vui lòng hoàn tất chuyển khoản đúng số tiền và nội dung mã đơn. Email này xác nhận đăng ký đã được ghi nhận, chưa phải xác nhận lịch hẹn cuối cùng.</td></tr>'+button+'<tr><td style="padding:22px 32px;border-top:1px solid #29233a;color:#777083;font:12px Arial,sans-serif;text-align:center">Khám phá bản thân · Bật phá tiềm năng</td></tr></table></div>';
}
function bookingHtml_(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];});}
function bookingHealth_() { const ss=getBookingSpreadsheet_(), properties=PropertiesService.getScriptProperties(), mode=paymentMode_(properties); const checks=Object.keys(BOOKING_SHEETS).map(name=>({name:name,ok:!!ss.getSheetByName(name)})); const paymentConfigured=['PAYMENT_BANK_CODE','PAYMENT_BANK_NAME','PAYMENT_ACCOUNT_NAME','PAYMENT_ACCOUNT_NO'].every(key=>!!properties.getProperty(key)); const sepayConfigured=mode!=='sepay'||!!properties.getProperty('PAYMENT_WEBHOOK_SECRET'); return {service:'booking-payment',ok:checks.every(c=>c.ok)&&paymentConfigured&&sepayConfigured,checks:checks,emailConfigured:!!(properties.getProperty('OWNER_EMAIL')||Session.getEffectiveUser().getEmail()),paymentConfigured:paymentConfigured,paymentMode:mode,sepayConfigured:sepayConfigured,timestamp:new Date().toISOString()}; }
function getBookingSpreadsheet_(){const id=PropertiesService.getScriptProperties().getProperty('BOOKING_SPREADSHEET_ID');if(id)return SpreadsheetApp.openById(id);const active=SpreadsheetApp.getActiveSpreadsheet();if(!active)throw bookingError_('CONFIG_ERROR','Thiếu BOOKING_SPREADSHEET_ID trong Script Properties.');return active;}
function bookingEnsureSheet_(ss,name,headers){const sheet=ss.getSheetByName(name)||ss.insertSheet(name);if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers]);return;}const existing=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String),missing=headers.filter(header=>existing.indexOf(header)<0);if(missing.length)sheet.getRange(1,existing.length+1,1,missing.length).setValues([missing]);}
function logEmail_(type,recipient,orderId,status,message){getBookingSpreadsheet_().getSheetByName('Email Log').appendRow([new Date(),type,recipient,orderId,status,String(message).slice(0,200)]);}
function logError_(source,action,orderId,message){try{const sheet=getBookingSpreadsheet_().getSheetByName('Error Log');if(sheet)sheet.appendRow([new Date(),source,action,orderId,String(message).slice(0,200)]);}catch(_) {}}
function bookingError_(code,message){const error=new Error(message);error.code=code;return error;}
function bookingSafe_(error){return String(error&&error.message||'Có lỗi xảy ra.').slice(0,200);}
function bookingJson_(ok,data,code,message){return ContentService.createTextOutput(JSON.stringify({ok:ok,data:data||null,error:ok?null:{code:code,message:message},requestId:Utilities.getUuid(),version:'v1'})).setMimeType(ContentService.MimeType.JSON);}
