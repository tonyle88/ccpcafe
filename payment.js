const config = window.CAFE_CCP_CONFIG || {};
const bookingApiUrl = config.bookingApiUrl || sessionStorage.getItem('cafeCcpBookingApiUrl') || '';
const orderId = new URLSearchParams(location.search).get('orderId') || '';
const elements = {
  loading: document.getElementById('payment-loading'), details: document.getElementById('payment-details'),
  error: document.getElementById('payment-error'), order: document.getElementById('order-id'),
  pkg: document.getElementById('package-name'), amount: document.getElementById('amount'),
  transfer: document.getElementById('transfer-content'), status: document.getElementById('payment-status'),
  confirm: document.getElementById('manual-confirm'), bank: document.getElementById('bank-name'),
  accountName: document.getElementById('account-name'), accountNo: document.getElementById('account-no')
};
const SUCCESS_STATUSES = new Set(['PAID', 'CONFIRMED', 'COMPLETED']);
const STOP_STATUSES = new Set([...SUCCESS_STATUSES, 'CANCELLED', 'EXPIRED']);
const POLL_DELAYS = [5000, 10000, 20000, 30000, 60000];
const POLL_MAX_MS = 10 * 60 * 1000;
let pollTimer;
let pollAttempt = 0;
let pollStartedAt = Date.now();
let hiddenAt = 0;

function formatVnd(value) { return new Intl.NumberFormat('vi-VN', { style:'currency', currency:'VND' }).format(value); }
function stopPolling() { clearTimeout(pollTimer); pollTimer = undefined; }
function schedulePoll() {
  stopPolling();
  if (document.hidden) return;
  if (Date.now() - pollStartedAt >= POLL_MAX_MS) {
    elements.error.textContent = 'Đã dừng tự động kiểm tra. Bạn có thể tải lại trang để xem trạng thái mới nhất.';
    return;
  }
  const delay = POLL_DELAYS[Math.min(pollAttempt, POLL_DELAYS.length - 1)];
  pollAttempt += 1;
  pollTimer = setTimeout(loadOrder, delay);
}

async function api(action, method = 'GET', data) {
  if (!bookingApiUrl) throw new Error('Booking API chưa được cấu hình.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs || 15000);
  try {
    if (method === 'GET') {
      const url = new URL(bookingApiUrl);
      url.searchParams.set('action', action);
      url.searchParams.set('orderId', orderId);
      const response = await fetch(url, { credentials:'omit', signal:controller.signal });
      return response.json();
    }
    const response = await fetch(bookingApiUrl, { method:'POST', credentials:'omit', signal:controller.signal, headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action,data}) });
    return response.json();
  } finally { clearTimeout(timeout); }
}

function render(order) {
  elements.loading.hidden = true;
  elements.details.hidden = false;
  elements.error.textContent = '';
  elements.order.textContent = order.orderId;
  elements.pkg.textContent = order.packageName;
  elements.amount.textContent = formatVnd(order.amount);
  elements.transfer.textContent = order.transferContent;
  elements.status.textContent = order.status;
  elements.bank.textContent = order.payment?.bankName || 'Chưa cấu hình ngân hàng';
  elements.accountName.textContent = order.payment?.accountName || '';
  elements.accountNo.textContent = order.payment?.accountNo || '';
  const reviewing = order.status === 'PAYMENT_REVIEW';
  elements.confirm.disabled = reviewing || STOP_STATUSES.has(order.status);
  if (reviewing) elements.confirm.textContent = 'Đang chờ đối soát';
  if (SUCCESS_STATUSES.has(order.status)) {
    stopPolling();
    location.replace(`thankyou.html?orderId=${encodeURIComponent(order.orderId)}`);
    return;
  }
  if (STOP_STATUSES.has(order.status)) {
    stopPolling();
    elements.error.textContent = 'Đơn đã kết thúc. Vui lòng liên hệ vận hành nếu bạn cần hỗ trợ.';
    return;
  }
  schedulePoll();
}

async function loadOrder() {
  try {
    if (!orderId) throw new Error('Thiếu mã đơn.');
    const payload = await api('checkPayment');
    if (!payload.ok) throw new Error(payload.error?.message || 'Không tải được đơn.');
    render(payload.data);
  } catch (error) {
    elements.loading.hidden = true;
    elements.error.textContent = error.name === 'AbortError' ? 'Kết nối quá thời gian. Hệ thống sẽ thử lại.' : error.message;
    schedulePoll();
  }
}

elements.confirm.addEventListener('click', async () => {
  elements.confirm.disabled = true;
  try {
    const payload = await api('manualConfirm', 'POST', { orderId });
    if (!payload.ok) throw new Error(payload.error?.message || 'Không thể cập nhật trạng thái.');
    elements.status.textContent = payload.data.status;
    elements.confirm.textContent = payload.data.status === 'PAYMENT_REVIEW' ? 'Đang chờ đối soát' : 'Đã cập nhật';
    if (SUCCESS_STATUSES.has(payload.data.status)) location.replace(`thankyou.html?orderId=${encodeURIComponent(orderId)}`);
  } catch (error) {
    elements.error.textContent = error.message;
    elements.confirm.disabled = false;
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    stopPolling();
    return;
  }
  if (hiddenAt && Date.now() - hiddenAt >= POLL_MAX_MS) {
    elements.error.textContent = 'Đã dừng tự động kiểm tra vì tab không hoạt động quá lâu. Hãy tải lại trang để tiếp tục.';
    return;
  }
  loadOrder();
});

loadOrder();
