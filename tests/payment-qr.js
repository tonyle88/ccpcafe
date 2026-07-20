const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createElement() {
  const listeners = {};
  return {
    hidden: false,
    style: {},
    dataset: {},
    textContent: '',
    disabled: false,
    src: '',
    addEventListener(name, handler) { listeners[name] = handler; }
  };
}

const elements = new Map();
const document = {
  hidden: false,
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, createElement());
    return elements.get(id);
  },
  addEventListener() {}
};
const context = {
  window: { CAFE_CCP_CONFIG: {} },
  document,
  location: { search: '?orderId=CCP260721ABCD', href: 'http://localhost/payment.html?orderId=CCP260721ABCD', replace() {} },
  sessionStorage: { getItem() { return ''; } },
  navigator: { clipboard: { writeText: async () => {} } },
  URL,
  URLSearchParams,
  Intl,
  AbortController,
  fetch: async () => { throw new Error('network disabled in unit test'); },
  setTimeout() { return 1; },
  clearTimeout() {}
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../payment.js'), 'utf8'), context);

const baseOrder = "{orderId:'CCP260721ABCD',packageName:'Gói test',amount:550000,transferContent:'CCP260721ABCD',status:'PENDING_PAYMENT'}";

vm.runInContext(`paymentContentConfig={bankName:'BIDV',accountName:'TEST',accountNo:'05480409701'};render({...${baseOrder},payment:{}})`, context);
assert.match(elements.get('payment-qr').src, /^\/api\/vietqr\?/, 'Phải tạo QR khi Admin có thông tin ngân hàng nhưng thiếu bankCode');
assert(elements.get('payment-qr').src.includes('bank=BIDV'), 'Phải suy ra bankCode từ tên ngân hàng');

vm.runInContext(`paymentContentConfig={};render({...${baseOrder},payment:{qrUrl:'https://img.vietqr.io/image/BIDV-05480409701-compact2.png'}})`, context);
assert.equal(elements.get('payment-qr').src, 'https://img.vietqr.io/image/BIDV-05480409701-compact2.png', 'Phải giữ QR do Booking API trả về');

vm.runInContext(`paymentContentConfig={};render({...${baseOrder},payment:{bankCode:'invalid/encrypted-bank-code-value-that-is-too-long=',bankName:'BIDV',accountName:'TEST',accountNo:'05480409701'}})`, context);
assert(elements.get('payment-qr').src.includes('bank=BIDV'), 'Phải bỏ bankCode sai và suy ra mã từ tên ngân hàng');
assert(!elements.get('payment-qr').src.includes('invalid'), 'Không được gửi bankCode sai tới proxy QR');

console.log('Payment QR regression checks passed.');
