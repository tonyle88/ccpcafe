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
const contentBackend=read('apps-script/content-admin/Code.gs');['saveNavigation','saveSection'].forEach(action=>assert(contentBackend.includes(`body.action === '${action}'`),`Content backend thiếu action ${action}`));
assert(contentBackend.includes("!/^https:\\/\\//i.test(href)"),'Navigation phải chặn URL không an toàn');
const adminHtml=read('admin/index.html');['navigation-panel','sections-panel'].forEach(id=>assert(adminHtml.includes(`id="${id}"`),`Admin thiếu panel ${id}`));
JSON.parse(read('vercel.json'));JSON.parse(read('package.json'));JSON.parse(read('apps-script/content-admin/appsscript.json'));JSON.parse(read('apps-script/booking-payment/appsscript.json'));
console.log(`Smoke checks passed: ${packages.length} packages, configs and deployment artifacts valid.`);
