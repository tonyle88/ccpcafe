const config = window.CAFE_CCP_CONFIG || {};
const bookingApiUrl = config.bookingApiUrl || sessionStorage.getItem('cafeCcpBookingApiUrl') || '';
const orderId = new URLSearchParams(location.search).get('orderId') || '';
const summary = (() => { try { return JSON.parse(sessionStorage.getItem('cafeCcpBookingSummary') || '{}'); } catch (_) { return {}; } })();
const elements = {
  order:document.getElementById('thankyou-order'), status:document.getElementById('thankyou-status'),
  message:document.getElementById('thankyou-message'), badge:document.getElementById('thankyou-badge'),
  title:document.getElementById('thankyou-title'), pkg:document.getElementById('thankyou-package'),
  amount:document.getElementById('thankyou-amount'), name:document.getElementById('thankyou-name'),
  customerRow:document.getElementById('customer-row'), backPayment:document.getElementById('back-payment')
};
const statusLabels = { PAID:'Đã thanh toán', CONFIRMED:'Đã xác nhận', COMPLETED:'Hoàn tất', PAYMENT_REVIEW:'Đăng ký thành công · chờ xác nhận', PENDING_PAYMENT:'Chưa thanh toán' };
const successStatuses = new Set(['PAYMENT_REVIEW','PAID','CONFIRMED','COMPLETED']);

function formatVnd(value) { return Number.isFinite(Number(value)) ? new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(Number(value)) : '—'; }
function renderSummary(order) {
  elements.order.textContent=order.orderId||orderId||'—';
  elements.pkg.textContent=order.packageName||summary.packageName||'—';
  elements.amount.textContent=formatVnd(order.amount??summary.amount);
  if(summary.orderId===orderId&&summary.name){elements.name.textContent=summary.name;elements.customerRow.style.display='flex';}
}
function renderState(order) {
  const status=order.status, success=successStatuses.has(status), review=status==='PAYMENT_REVIEW';
  renderSummary(order);
  elements.status.textContent=statusLabels[status]||'Chưa xác định';
  elements.badge.className=`status-badge ${success?'success':'review'}`;
  elements.badge.innerHTML=`<span></span> ${review?'Đăng ký thành công':success?'Thanh toán đã xác nhận':'Đang chờ xác nhận'}`;
  if(success){
    elements.message.innerHTML=review?'Thông báo chuyển khoản của bạn đã được ghi nhận.<br>Hãy nhắn fanpage để chúng mình kiểm tra và chốt lịch trong vòng <strong>24 giờ</strong>.':'Đơn đăng ký và thanh toán của bạn đã được xác nhận.<br>Chúng mình sẽ liên hệ để chốt lịch trong vòng <strong>24 giờ</strong>.';
    elements.backPayment.style.display='none';
  }else{
    elements.title.innerHTML='Đăng ký của bạn<br><em>đã được ghi nhận!</em>';
    elements.message.textContent=status==='PAYMENT_REVIEW'?'Chúng mình đang đối soát giao dịch và sẽ cập nhật sớm nhất.':'Thanh toán chưa hoàn tất. Vui lòng quay lại trang thanh toán để tiếp tục.';
    elements.backPayment.href=`payment.html?${new URLSearchParams({orderId})}`;
    elements.backPayment.style.display='block';
  }
}

async function verifyOrder() {
  renderSummary({orderId});
  if(!orderId||!bookingApiUrl){elements.status.textContent='Chưa thể xác minh';elements.message.textContent='Vui lòng mở trang từ liên kết thanh toán hoặc liên hệ vận hành.';return;}
  try{
    const url=new URL(bookingApiUrl);url.searchParams.set('action', 'checkPayment');url.searchParams.set('orderId',orderId);
    const response=await fetch(url,{credentials:'omit'}),payload=await response.json();
    if(!payload.ok||!payload.data?.status)throw new Error('ORDER_NOT_FOUND');
    renderState(payload.data);
  }catch(_){
    elements.badge.className='status-badge review';elements.badge.innerHTML='<span></span> Chưa thể xác minh';
    elements.status.textContent='Đang chờ xác nhận';elements.message.textContent='Hệ thống chưa đọc được trạng thái mới nhất. Vui lòng quay lại trang thanh toán hoặc liên hệ vận hành.';
    elements.backPayment.href=`payment.html?${new URLSearchParams({orderId})}`;elements.backPayment.style.display=orderId?'block':'none';
  }
}

verifyOrder();
