const BOOKING_HEADERS = ['Created At','Customer Name','Phone','Email','Package Code','Package Name','Preferred Date','Party Size','Topic','Order ID','Base Amount','Discount Amount','Final Amount','Currency','Status','Transfer Content','Payment Transaction ID','Paid Amount','Paid At','Owner Email','Idempotency Key','Last Updated At'];
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
    return bookingJson_(false,null,'NOT_FOUND','Action không tồn tại.');
  } catch(error) { logError_('api','post','',bookingSafe_(error)); return bookingJson_(false,null,error.code||'INTERNAL_ERROR',bookingSafe_(error)); }
}

function setupBookingSpreadsheet() { const ss=getBookingSpreadsheet_(); Object.keys(BOOKING_SHEETS).forEach(name=>bookingEnsureSheet_(ss,name,BOOKING_SHEETS[name])); return bookingHealth_(); }

function register_(data) {
  const clean=validateBooking_(data), pkg=PACKAGE_CATALOG[clean.packageCode];
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet=getBookingSpreadsheet_().getSheetByName('Bookings');
    const existing=findBooking_('Idempotency Key',clean.idempotencyKey);
    if(existing) return publicOrder_(existing);
    const discountRate=clean.partySize===2?0.10:(clean.partySize>=3?0.15:0);
    const discount=Math.round(pkg.price*discountRate), finalAmount=pkg.price-discount;
    const orderId='CCP-'+Utilities.formatDate(new Date(),'Asia/Ho_Chi_Minh','yyyyMMdd')+'-'+Utilities.getUuid().replace(/-/g,'').toUpperCase();
    const ownerEmail=PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL')||Session.getEffectiveUser().getEmail()||'';
    const row=[new Date(),clean.name,clean.phone,clean.email,clean.packageCode,pkg.name,clean.preferredDate,clean.partySize,clean.topic,orderId,pkg.price,discount,finalAmount,'VND','PENDING_PAYMENT',orderId,'','', '',ownerEmail,clean.idempotencyKey,new Date()];
    sheet.appendRow(row);
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

function normalizeOrderId_(value) { const orderId=String(value||'').trim().toUpperCase(); if(!/^CCP-[0-9]{8}-[A-F0-9]{32}$/.test(orderId)) throw bookingError_('ORDER_NOT_FOUND','Không tìm thấy đơn.'); return orderId; }
function checkPayment_(orderId) { const row=findBooking_('Order ID',normalizeOrderId_(orderId)); if(!row) throw bookingError_('ORDER_NOT_FOUND','Không tìm thấy đơn.'); return publicOrder_(row); }
function manualConfirm_(data) {
  const orderId=normalizeOrderId_(data.orderId), lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const row=findBooking_('Order ID',orderId,true);
    if(!row) throw bookingError_('ORDER_NOT_FOUND','Không tìm thấy đơn.');
    const current=String(row.object.Status||'');
    if(current==='PENDING_PAYMENT') {
      row.sheet.getRange(row.rowNumber,BOOKING_HEADERS.indexOf('Status')+1).setValue('PAYMENT_REVIEW');
      row.sheet.getRange(row.rowNumber,BOOKING_HEADERS.indexOf('Last Updated At')+1).setValue(new Date());
      return {orderId:orderId,status:'PAYMENT_REVIEW'};
    }
    if(['PAYMENT_REVIEW','PAID','CONFIRMED','COMPLETED'].includes(current)) return {orderId:orderId,status:current};
    throw bookingError_('INVALID_STATE','Đơn không thể chuyển sang chờ đối soát.');
  } finally { lock.releaseLock(); }
}
function paymentWebhook_(data,signature) { const secret=PropertiesService.getScriptProperties().getProperty('PAYMENT_WEBHOOK_SECRET'); if(!secret||signature!==secret) throw bookingError_('FORBIDDEN','Webhook không hợp lệ.'); throw bookingError_('NOT_IMPLEMENTED','Cần tích hợp chữ ký theo nhà cung cấp thanh toán đã chọn.'); }
function publicOrder_(record) { const row=record.object||record, properties=PropertiesService.getScriptProperties(); return { orderId:row['Order ID'], packageName:row['Package Name'], amount:Number(row['Final Amount']), currency:row.Currency, status:row.Status, transferContent:row['Transfer Content'], payment:{ bankName:properties.getProperty('PAYMENT_BANK_NAME')||'', accountName:properties.getProperty('PAYMENT_ACCOUNT_NAME')||'', accountNo:properties.getProperty('PAYMENT_ACCOUNT_NO')||'' } }; }
function findBooking_(header,value,withMeta) { const sheet=getBookingSpreadsheet_().getSheetByName('Bookings'); if(!sheet||sheet.getLastRow()<2)return null; const values=sheet.getDataRange().getValues(), headers=values.shift(), index=headers.indexOf(header); for(let i=0;i<values.length;i++)if(String(values[i][index])===value){const object=headers.reduce((o,k,j)=>(o[k]=values[i][j],o),{});return withMeta?{object:object,sheet:sheet,rowNumber:i+2}:object;} return null; }
function sendBookingEmails_(clean,pkg,orderId,amount,ownerEmail) { try { const subject='Xác nhận đăng ký '+orderId, body='Chào '+clean.name+',\n\nĐăng ký '+pkg.name+' đã được ghi nhận.\nMã đơn: '+orderId+'\nSố tiền: '+amount.toLocaleString('vi-VN')+' VND.\n\nClow Cat Patronus'; MailApp.sendEmail(clean.email,subject,body); logEmail_('customer',clean.email,orderId,'success',''); if(ownerEmail){MailApp.sendEmail(ownerEmail,'Booking mới '+orderId,'Khách: '+clean.name+'\nGói: '+pkg.name+'\nMã đơn: '+orderId);logEmail_('owner',ownerEmail,orderId,'success','');} } catch(error) { logEmail_('booking','',orderId,'error',bookingSafe_(error)); } }
function bookingHealth_() { const ss=getBookingSpreadsheet_(), properties=PropertiesService.getScriptProperties(); const checks=Object.keys(BOOKING_SHEETS).map(name=>({name:name,ok:!!ss.getSheetByName(name)})); const paymentConfigured=['PAYMENT_BANK_NAME','PAYMENT_ACCOUNT_NAME','PAYMENT_ACCOUNT_NO'].every(key=>!!properties.getProperty(key)); return {service:'booking-payment',ok:checks.every(c=>c.ok)&&paymentConfigured,checks:checks,emailConfigured:!!(properties.getProperty('OWNER_EMAIL')||Session.getEffectiveUser().getEmail()),paymentConfigured:paymentConfigured,timestamp:new Date().toISOString()}; }
function getBookingSpreadsheet_(){const id=PropertiesService.getScriptProperties().getProperty('BOOKING_SPREADSHEET_ID');if(id)return SpreadsheetApp.openById(id);const active=SpreadsheetApp.getActiveSpreadsheet();if(!active)throw bookingError_('CONFIG_ERROR','Thiếu BOOKING_SPREADSHEET_ID trong Script Properties.');return active;}
function bookingEnsureSheet_(ss,name,headers){const sheet=ss.getSheetByName(name)||ss.insertSheet(name);if(sheet.getLastRow()===0)sheet.getRange(1,1,1,headers.length).setValues([headers]);}
function logEmail_(type,recipient,orderId,status,message){getBookingSpreadsheet_().getSheetByName('Email Log').appendRow([new Date(),type,recipient,orderId,status,String(message).slice(0,200)]);}
function logError_(source,action,orderId,message){try{const sheet=getBookingSpreadsheet_().getSheetByName('Error Log');if(sheet)sheet.appendRow([new Date(),source,action,orderId,String(message).slice(0,200)]);}catch(_) {}}
function bookingError_(code,message){const error=new Error(message);error.code=code;return error;}
function bookingSafe_(error){return String(error&&error.message||'Có lỗi xảy ra.').slice(0,200);}
function bookingJson_(ok,data,code,message){return ContentService.createTextOutput(JSON.stringify({ok:ok,data:data||null,error:ok?null:{code:code,message:message},requestId:Utilities.getUuid(),version:'v1'})).setMimeType(ContentService.MimeType.JSON);}
