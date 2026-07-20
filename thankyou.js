const config = window.CAFE_CCP_CONFIG || {};
const bookingApiUrl = config.bookingApiUrl || sessionStorage.getItem('cafeCcpBookingApiUrl') || '';
const orderId = new URLSearchParams(location.search).get('orderId') || '';
const orderElement = document.getElementById('thankyou-order');
const statusElement = document.getElementById('thankyou-status');
const messageElement = document.getElementById('thankyou-message');
const statusLabels = { PAID:'Đã thanh toán', CONFIRMED:'Đã xác nhận', COMPLETED:'Hoàn tất' };

orderElement.textContent = orderId || '—';
statusElement.textContent = 'Đang xác minh…';

async function verifyOrder() {
  if (!orderId || !bookingApiUrl) {
    statusElement.textContent = 'Chưa thể xác minh';
    messageElement.textContent = 'Vui lòng mở trang từ liên kết thanh toán hoặc liên hệ vận hành.';
    return;
  }
  try {
    const url = new URL(bookingApiUrl);
    url.searchParams.set('action', 'checkPayment');
    url.searchParams.set('orderId', orderId);
    const response = await fetch(url, { credentials:'omit' });
    const payload = await response.json();
    if (!payload.ok || !statusLabels[payload.data?.status]) throw new Error('ORDER_NOT_CONFIRMED');
    orderElement.textContent = payload.data.orderId;
    statusElement.textContent = statusLabels[payload.data.status];
    messageElement.textContent = 'Đăng ký của bạn đã được xác nhận. Chúng mình sẽ liên hệ để chốt lịch.';
  } catch (_) {
    statusElement.textContent = 'Đang chờ xác nhận';
    messageElement.textContent = 'Trạng thái chưa được xác nhận. Vui lòng quay lại trang thanh toán hoặc liên hệ vận hành.';
  }
}

verifyOrder();
