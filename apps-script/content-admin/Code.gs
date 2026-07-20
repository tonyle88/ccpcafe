const CONTENT_SCHEMA = Object.freeze({
  'Content': ['Enabled','Key','Section','Description','Selector','Type','Attribute','Value','Updated At','Updated By'],
  'Service Packages': ['Enabled','Code','Name','Price','Duration','Unit','Icon','Featured','Tag','Features','Booking Note','Order','Updated At','Updated By'],
  'Navigation': ['Key','Label','Href','Enabled','Order','Type','Updated At','Updated By'],
  'Section Order': ['Section Key','Order','Visible'],
  'Custom Sections': ['Enabled','ID','Section Label','Title','Summary','HTML Content','Navigation Label','Order','Updated At','Updated By'],
  'Admin Users': ['Username','Password Hash','Role','Status','Display Name','Created At','Updated At','Last Login'],
  'Audit Log': ['Timestamp','Action','Status','Username','Role','Target Type','Target ID','Details','Message'],
  'Backup Log': ['Timestamp','Type','Status','Username','File ID','File Name','File URL','Details','Message']
});
const PUBLIC_CACHE_KEY = 'public-init-v2';

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'health');
  try {
    if (action === 'publicInit') return jsonResponse_(true, publicInit_());
    if (action === 'health') return jsonResponse_(true, health_());
    return jsonResponse_(false, null, 'NOT_FOUND', 'Action không tồn tại.');
  } catch (error) {
    return jsonResponse_(false, null, 'INTERNAL_ERROR', safeMessage_(error));
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'login') return jsonResponse_(true, login_(body.data || {}));
    if (body.action === 'logout') return jsonResponse_(true, logout_(body.token));
    if (body.action === 'adminInit') return jsonResponse_(true, adminInit_(requireSession_(body.token)));
    if (body.action === 'saveContent') return jsonResponse_(true, saveRow_('Content', body.data, requireSession_(body.token, ['admin','editor'])));
    if (body.action === 'savePackage') return jsonResponse_(true, saveRow_('Service Packages', body.data, requireSession_(body.token, ['admin','editor'])));
    if (body.action === 'saveNavigation') return jsonResponse_(true, saveRow_('Navigation', body.data, requireSession_(body.token, ['admin','editor'])));
    if (body.action === 'saveSection') return jsonResponse_(true, saveRow_('Section Order', body.data, requireSession_(body.token, ['admin','editor'])));
    if (body.action === 'saveUser') return jsonResponse_(true, saveUser_(body.data || {}, requireSession_(body.token, ['admin'])));
    return jsonResponse_(false, null, 'NOT_FOUND', 'Action không tồn tại.');
  } catch (error) {
    return jsonResponse_(false, null, error.code || 'INTERNAL_ERROR', safeMessage_(error));
  }
}

function setupContentSpreadsheet() {
  const spreadsheet = getContentSpreadsheet_();
  Object.keys(CONTENT_SCHEMA).forEach(name => ensureSheet_(spreadsheet, name, CONTENT_SCHEMA[name]));
  seedContent_(spreadsheet);
  return health_();
}

function bootstrapAdminFromProperties() {
  const properties = PropertiesService.getScriptProperties();
  const username = String(properties.getProperty('ADMIN_BOOTSTRAP_USERNAME') || '').trim().toLowerCase();
  const password = String(properties.getProperty('ADMIN_BOOTSTRAP_PASSWORD') || '');
  if (!username || password.length < 12) throw new Error('Cần ADMIN_BOOTSTRAP_USERNAME và ADMIN_BOOTSTRAP_PASSWORD tối thiểu 12 ký tự.');
  const sheet = getContentSpreadsheet_().getSheetByName('Admin Users');
  if (!sheet) throw new Error('Hãy chạy setupContentSpreadsheet trước.');
  const exists = rowsAsObjects_(sheet).some(user => String(user.Username).toLowerCase() === username);
  if (exists) throw new Error('Tài khoản đã tồn tại.');
  sheet.appendRow([username,createPasswordHash_(password),'admin','active','Administrator',new Date(),new Date(),'']);
  properties.deleteProperty('ADMIN_BOOTSTRAP_PASSWORD');
  audit_('bootstrap','success',username,'admin','user',username,'','Tạo tài khoản ban đầu');
  return { created:true, username:username };
}

function publicInit_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(PUBLIC_CACHE_KEY);
  if (cached) return JSON.parse(cached);
  const spreadsheet = getContentSpreadsheet_();
  const result = {
    content: rowsAsObjects_(spreadsheet.getSheetByName('Content')).filter(row => truthy_(row.Enabled)).map(contentPublic_),
    packages: rowsAsObjects_(spreadsheet.getSheetByName('Service Packages')).filter(row => truthy_(row.Enabled)).sort((a,b) => Number(a.Order)-Number(b.Order)).map(packagePublic_),
    navigation: rowsAsObjects_(spreadsheet.getSheetByName('Navigation')).filter(row => truthy_(row.Enabled)).sort((a,b) => Number(a.Order)-Number(b.Order)).map(navigationPublic_),
    sections: rowsAsObjects_(spreadsheet.getSheetByName('Section Order')).filter(row => truthy_(row.Visible)).sort((a,b) => Number(a.Order)-Number(b.Order)).map(sectionPublic_),
    config: { bookingApiUrl: PropertiesService.getScriptProperties().getProperty('BOOKING_WEB_APP_URL') || '' }
  };
  cache.put(PUBLIC_CACHE_KEY, JSON.stringify(result), 300);
  return result;
}

function login_(data) {
  const username = String(data.username || '').trim().toLowerCase();
  const password = String(data.password || '');
  if (!username || !password) throw appError_('VALIDATION_ERROR', 'Thiếu tên đăng nhập hoặc mật khẩu.');
  const cache = CacheService.getScriptCache();
  const rateKey = 'login-attempts:' + username;
  const attempts = Number(cache.get(rateKey) || 0);
  if (attempts >= 8) throw appError_('RATE_LIMITED', 'Đăng nhập tạm khóa. Vui lòng thử lại sau.');
  const usersSheet = getContentSpreadsheet_().getSheetByName('Admin Users');
  const users = rowsAsObjects_(usersSheet);
  const user = users.find(item => String(item.Username).toLowerCase() === username && String(item.Status).toLowerCase() === 'active');
  if (!user || !verifyPassword_(password, String(user['Password Hash']))) {
    cache.put(rateKey, String(attempts + 1), 900);
    audit_('login','error',username,'','user',username,'','Đăng nhập thất bại');
    throw appError_('AUTH_REQUIRED', 'Thông tin đăng nhập không đúng.');
  }
  cache.remove(rateKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('session:' + token, JSON.stringify({ username: user.Username }), 21600);
  const userRow = users.findIndex(item => String(item.Username).toLowerCase() === username) + 2;
  usersSheet.getRange(userRow, CONTENT_SCHEMA['Admin Users'].indexOf('Last Login') + 1).setValue(new Date());
  audit_('login','success',user.Username,user.Role,'user',user.Username,'','Đăng nhập thành công');
  return { token: token, username: user.Username, role: user.Role, displayName: user['Display Name'], expiresIn: 21600 };
}

function logout_(token) {
  if (token) CacheService.getScriptCache().remove('session:' + token);
  return { loggedOut: true };
}

function requireSession_(token, roles) {
  const raw = token && CacheService.getScriptCache().get('session:' + token);
  if (!raw) throw appError_('AUTH_REQUIRED', 'Phiên đăng nhập đã hết hạn.');
  const cached = JSON.parse(raw);
  const user = rowsAsObjects_(getContentSpreadsheet_().getSheetByName('Admin Users')).find(item => String(item.Username).toLowerCase() === String(cached.username).toLowerCase() && String(item.Status).toLowerCase() === 'active');
  if (!user) throw appError_('AUTH_REQUIRED', 'Tài khoản không còn hoạt động.');
  const session = { username:user.Username, role:String(user.Role).toLowerCase(), displayName:user['Display Name'] };
  if (roles && roles.indexOf(session.role) < 0) throw appError_('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
  return session;
}

function adminInit_(session) {
  const spreadsheet = getContentSpreadsheet_();
  const data = { session: session, health: health_(), content: rowsAsObjects_(spreadsheet.getSheetByName('Content')), packages: rowsAsObjects_(spreadsheet.getSheetByName('Service Packages')), navigation: rowsAsObjects_(spreadsheet.getSheetByName('Navigation')), sections: rowsAsObjects_(spreadsheet.getSheetByName('Section Order')) };
  if (session.role === 'admin') data.users = rowsAsObjects_(spreadsheet.getSheetByName('Admin Users')).map(user => ({ Username:user.Username, Role:user.Role, Status:user.Status, 'Display Name':user['Display Name'], 'Last Login':user['Last Login'] }));
  return data;
}

function saveUser_(data, session) {
  const sheet = getContentSpreadsheet_().getSheetByName('Admin Users');
  const headers = CONTENT_SCHEMA['Admin Users'];
  const username = String(data.Username || '').trim().toLowerCase();
  const role = String(data.Role || '').trim().toLowerCase();
  const status = String(data.Status || '').trim().toLowerCase();
  const displayName = String(data['Display Name'] || '').trim();
  const password = String(data.Password || '');
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) throw appError_('VALIDATION_ERROR', 'Username phải dài 3–64 ký tự và chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  if (!['admin','editor'].includes(role) || !['active','disabled'].includes(status)) throw appError_('VALIDATION_ERROR', 'Role hoặc trạng thái không hợp lệ.');
  if (!displayName || displayName.length > 100) throw appError_('VALIDATION_ERROR', 'Tên hiển thị không hợp lệ.');
  const rows = rowsAsObjects_(sheet);
  const existingIndex = rows.findIndex(user => String(user.Username).toLowerCase() === username);
  const existing = existingIndex >= 0 ? rows[existingIndex] : null;
  if (!existing && password.length < 12) throw appError_('VALIDATION_ERROR', 'User mới cần mật khẩu tối thiểu 12 ký tự.');
  if (password && password.length < 12) throw appError_('VALIDATION_ERROR', 'Mật khẩu mới phải có tối thiểu 12 ký tự.');
  if (username === String(session.username).toLowerCase() && (role !== 'admin' || status !== 'active')) throw appError_('VALIDATION_ERROR', 'Bạn không thể tự hạ quyền hoặc vô hiệu hóa tài khoản đang dùng.');
  const otherActiveAdmins = rows.filter(user => String(user.Username).toLowerCase() !== username && String(user.Role).toLowerCase() === 'admin' && String(user.Status).toLowerCase() === 'active').length;
  if (existing && String(existing.Role).toLowerCase() === 'admin' && String(existing.Status).toLowerCase() === 'active' && (role !== 'admin' || status !== 'active') && otherActiveAdmins === 0) throw appError_('VALIDATION_ERROR', 'Phải giữ ít nhất một admin đang hoạt động.');
  const record = [username, password ? createPasswordHash_(password) : existing['Password Hash'], role, status, displayName, existing ? existing['Created At'] : new Date(), new Date(), existing ? existing['Last Login'] : ''];
  if (existing) sheet.getRange(existingIndex + 2, 1, 1, headers.length).setValues([record]); else sheet.appendRow(record);
  audit_('save','success',session.username,session.role,'user',username,'role='+role+';status='+status,'Đã lưu user');
  return { saved:true, username:username };
}

function saveRow_(sheetName, data, session) {
  const sheet = getContentSpreadsheet_().getSheetByName(sheetName);
  const headers = CONTENT_SCHEMA[sheetName];
  const keyNames = { 'Content':'Key', 'Service Packages':'Code', 'Navigation':'Key', 'Section Order':'Section Key' };
  const keyName = keyNames[sheetName];
  const key = String(data[keyName] || '').trim();
  if (!key) throw appError_('VALIDATION_ERROR', 'Thiếu mã định danh.');
  validateManagedRow_(sheetName, data);
  const rows = sheet.getDataRange().getValues();
  let rowNumber = 0;
  for (let i = 1; i < rows.length; i++) if (String(rows[i][headers.indexOf(keyName)]) === key) rowNumber = i + 1;
  const record = headers.map(header => {
    if (header === 'Updated At') return new Date();
    if (header === 'Updated By') return session.username;
    return data[header] === undefined ? '' : data[header];
  });
  if (rowNumber) sheet.getRange(rowNumber,1,1,headers.length).setValues([record]); else sheet.appendRow(record);
  CacheService.getScriptCache().remove(PUBLIC_CACHE_KEY);
  audit_('save','success',session.username,session.role,sheetName,key,'','Đã lưu');
  return { saved: true, id: key };
}

function validateManagedRow_(sheetName, data) {
  if (sheetName === 'Navigation') {
    const href = String(data.Href || '').trim();
    const isInternalPath = href.startsWith('/') && !href.startsWith('//');
    if (!href || (!href.startsWith('#') && !isInternalPath && !/^https:\/\//i.test(href))) {
      throw appError_('VALIDATION_ERROR', 'Liên kết phải là anchor, đường dẫn nội bộ hoặc HTTPS.');
    }
  }
  if (sheetName === 'Navigation' || sheetName === 'Section Order') {
    const order = Number(data.Order);
    if (!Number.isInteger(order) || order < 0 || order > 999) throw appError_('VALIDATION_ERROR', 'Thứ tự phải là số nguyên từ 0 đến 999.');
  }
}

function health_() {
  const spreadsheet = getContentSpreadsheet_();
  const checks = Object.keys(CONTENT_SCHEMA).map(name => ({ name:name, ok:!!spreadsheet.getSheetByName(name) }));
  return { service:'content-admin', ok:checks.every(item => item.ok), checks:checks, timestamp:new Date().toISOString() };
}

function seedContent_(spreadsheet) {
  const content = spreadsheet.getSheetByName('Content');
  if (content.getLastRow() === 1) {
    content.getRange(2,1,3,10).setValues([
      [true,'hero.subtitle','hero','Dòng kêu gọi ngắn','.hero-sub','text','','Book đi chờ chi!!!',new Date(),'setup'],
      [true,'about.title','about','Tiêu đề giới thiệu','.section-about .section-title','text','','Bài Clow – Gương soi tâm hồn',new Date(),'setup'],
      [true,'packages.title','packages','Tiêu đề gói dịch vụ','.section-packages .section-title','text','','Chọn hành trình của bạn',new Date(),'setup']
    ]);
  }
  const packages = spreadsheet.getSheetByName('Service Packages');
  if (packages.getLastRow() === 1) {
    packages.getRange(2,1,4,14).setValues([
      [true,'kham-pha','Gói Khám Phá',300000,30,'phút','icons/icon-sakura.svg',false,'Phổ biến','1 chủ đề tư vấn|Trải bài Clow chuyên sâu|Lắng nghe & định hướng|1 ly nước miễn phí','',1,new Date(),'setup'],
      [true,'ket-noi','Gói Kết Nối',400000,45,'phút','icons/icon-star.svg',true,'Bán chạy nhất','2 chủ đề tư vấn|Trải bài Clow chuyên sâu|Phân tích đa chiều|1 ly nước miễn phí','',2,new Date(),'setup'],
      [true,'toan-dien','Gói Toàn Diện',550000,60,'phút','icons/icon-orb.svg',false,'Sâu sắc','Nhiều chủ đề tư vấn|Trải bài toàn diện|Phân tích sâu & giải pháp|1 ly nước miễn phí','',3,new Date(),'setup'],
      [true,'3in1','Tư Vấn 3-in-1 Đặc Biệt',550000,60,'phút','icons/icon-moon.svg',true,'Góc nhìn đa chiều','Kết hợp Bài Clow, Bản Đồ Sao và Nhân Số Học|Đào sâu nguyên nhân cốt lõi|Lộ trình phát triển thực tế|1 ly nước miễn phí','Vui lòng cung cấp ngày, giờ và nơi sinh chính xác.',4,new Date(),'setup']
    ]);
  }
  const sections = spreadsheet.getSheetByName('Section Order');
  if (sections.getLastRow() === 1) sections.getRange(2,1,8,3).setValues(['hero','about','instructor','packages','process','feedback','book','footer'].map((key,index) => [key,index+1,true]));
  const navigation = spreadsheet.getSheetByName('Navigation');
  if (navigation.getLastRow() === 1) {
    navigation.getRange(2,1,5,8).setValues([
      ['about','Về chúng tôi','#about',true,1,'link',new Date(),'setup'],
      ['packages','Gói dịch vụ','#packages',true,2,'link',new Date(),'setup'],
      ['process','Quy trình','#process',true,3,'link',new Date(),'setup'],
      ['feedback','Cảm nhận','#feedback',true,4,'link',new Date(),'setup'],
      ['book','Đặt lịch ngay ✨','#book',true,5,'cta',new Date(),'setup']
    ]);
  }
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1,1,1,headers.length).setValues([headers]);
}
function getContentSpreadsheet_() { const id=PropertiesService.getScriptProperties().getProperty('CONTENT_SPREADSHEET_ID'); if(id)return SpreadsheetApp.openById(id); const active=SpreadsheetApp.getActiveSpreadsheet(); if(!active)throw appError_('CONFIG_ERROR','Thiếu CONTENT_SPREADSHEET_ID trong Script Properties.'); return active; }
function rowsAsObjects_(sheet) { if (!sheet || sheet.getLastRow() < 2) return []; const values=sheet.getDataRange().getValues(), headers=values.shift(); return values.map(row => headers.reduce((obj,key,index) => (obj[key]=row[index],obj),{})); }
function contentPublic_(row) { return { key:String(row.Key), selector:String(row.Selector), type:String(row.Type || 'text'), attribute:String(row.Attribute || ''), value:String(row.Value || '') }; }
function packagePublic_(row) { return { code:String(row.Code), name:String(row.Name), price:Number(row.Price), duration:Number(row.Duration), unit:String(row.Unit), icon:String(row.Icon), featured:truthy_(row.Featured), tag:String(row.Tag), features:String(row.Features).split('|').filter(Boolean), bookingNote:String(row['Booking Note'] || '') }; }
function navigationPublic_(row) { return { key:String(row.Key), label:String(row.Label), href:String(row.Href), order:Number(row.Order), type:String(row.Type || '') }; }
function sectionPublic_(row) { return { key:String(row['Section Key']), order:Number(row.Order) }; }
function truthy_(value) { return value === true || String(value).toLowerCase() === 'true' || String(value) === '1'; }
function digestPassword_(password,salt) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8)); }
function createPasswordHash_(password) { const salt=Utilities.getUuid().replace(/-/g,''); return salt+'$'+digestPassword_(password,salt); }
function verifyPassword_(password,stored) { const parts=stored.split('$'); return parts.length===2 && constantTimeEqual_(parts[1],digestPassword_(password,parts[0])); }
function constantTimeEqual_(a,b) { if (a.length !== b.length) return false; let value=0; for(let i=0;i<a.length;i++) value |= a.charCodeAt(i)^b.charCodeAt(i); return value===0; }
function audit_(action,status,username,role,targetType,targetId,details,message) { getContentSpreadsheet_().getSheetByName('Audit Log').appendRow([new Date(),action,status,username,role,targetType,targetId,String(details).slice(0,500),String(message).slice(0,200)]); }
function appError_(code,message) { const error=new Error(message); error.code=code; return error; }
function safeMessage_(error) { return String(error && error.message || 'Có lỗi xảy ra.').slice(0,200); }
function jsonResponse_(ok,data,code,message) { return ContentService.createTextOutput(JSON.stringify({ ok:ok, data:data || null, error:ok?null:{ code:code, message:message }, requestId:Utilities.getUuid(), version:'v1' })).setMimeType(ContentService.MimeType.JSON); }
