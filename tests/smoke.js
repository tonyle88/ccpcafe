const fs=require('fs');const vm=require('vm');const path=require('path');const root=path.resolve(__dirname,'..');
function read(file){return fs.readFileSync(path.join(root,file),'utf8')}
function assert(condition,message){if(!condition)throw new Error(message)}
const context={window:{}};vm.createContext(context);vm.runInContext(read('config.js'),context);vm.runInContext(read('data.js'),context);
const packages=context.window.CAFE_CCP_FALLBACK.packages;assert(packages.length===4,'Fallback phải có đúng 4 gói ban đầu');
assert(new Set(packages.map(item=>item.code)).size===packages.length,'Package code phải duy nhất');
packages.forEach(item=>{assert(item.price>0,`Giá ${item.code} phải dương`);assert(item.duration>0,`Thời lượng ${item.code} phải dương`)});
const html=read('index.html');['config.js','data.js','script.js'].forEach(file=>assert(html.includes(`src="${file}"`),`Thiếu ${file} trong index.html`));
['payment.html','thankyou.html','admin/index.html','vercel.json'].forEach(file=>assert(fs.existsSync(path.join(root,file)),`Thiếu ${file}`));
const bookingBackend=read('apps-script/booking-payment/Code.gs');packages.forEach(item=>assert(bookingBackend.includes(`'${item.code}'`),`Backend thiếu package ${item.code}`));
['normalizeOrderId_','INVALID_STATE','Last Updated At'].forEach(term=>assert(bookingBackend.includes(term),`Booking backend thiếu contract ${term}`));
const contentBackend=read('apps-script/content-admin/Code.gs');['saveNavigation','saveSection','saveUser'].forEach(action=>assert(contentBackend.includes(`body.action === '${action}'`),`Content backend thiếu action ${action}`));
assert(contentBackend.includes("!/^https:\\/\\//i.test(href)"),'Navigation phải chặn URL không an toàn');
assert(contentBackend.includes("requireSession_(body.token, ['admin'])"),'API user phải chỉ cho admin');
['Bạn không thể tự hạ quyền','Phải giữ ít nhất một admin'].forEach(message=>assert(contentBackend.includes(message),`User guard thiếu: ${message}`));
['contentPublic_','navigationPublic_','sectionPublic_'].forEach(mapper=>assert(contentBackend.includes(`.map(${mapper})`),`Public API thiếu allowlist mapper ${mapper}`));
assert(contentBackend.includes("const PUBLIC_CACHE_KEY = 'public-init-v2'"),'Public cache key phải tăng khi contract đổi');
['bookingRemoteHealth_','operationsSummary_','UrlFetchApp.fetch'].forEach(term=>assert(contentBackend.includes(term),`Admin dashboard backend thiếu ${term}`));
assert(contentBackend.includes('script\\.google\\.com|script\\.googleusercontent\\.com'),'Booking health endpoint phải giới hạn Google Apps Script');
const adminHtml=read('admin/index.html');['navigation-panel','sections-panel','users-panel'].forEach(id=>assert(adminHtml.includes(`id="${id}"`),`Admin thiếu panel ${id}`));
const adminScript=read('admin/app.js');assert(adminScript.includes("await api('saveUser', record)"),'Admin UI thiếu lưu user');assert(!adminScript.includes('Password Hash'),'Admin UI không được đọc hoặc hiển thị password hash');
['renderHealthOverview','content-health','booking-health','recent-errors'].forEach(term=>assert(adminScript.includes(term)||adminHtml.includes(`id="${term}"`),`Admin dashboard thiếu ${term}`));
const landingScript=read('script.js');['renderContent','renderNavigation','renderSections','renderPublicData'].forEach(name=>assert(landingScript.includes(`function ${name}(`),`Landing thiếu renderer ${name}`));
const paymentScript=read('payment.js');['POLL_DELAYS','POLL_MAX_MS','visibilitychange','STOP_STATUSES'].forEach(term=>assert(paymentScript.includes(term),`Payment polling thiếu ${term}`));
const thankyouScript=read('thankyou.js');assert(thankyouScript.includes("url.searchParams.set('action', 'checkPayment')"),'Thank-you phải xác minh trạng thái từ backend');assert(!thankyouScript.includes("params.get('status')"),'Thank-you không được tin status từ URL');
JSON.parse(read('vercel.json'));JSON.parse(read('package.json'));JSON.parse(read('apps-script/content-admin/appsscript.json'));JSON.parse(read('apps-script/booking-payment/appsscript.json'));
console.log(`Smoke checks passed: ${packages.length} packages, configs and deployment artifacts valid.`);
