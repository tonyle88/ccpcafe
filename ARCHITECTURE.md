# Kiến trúc Cafe-CCP

## Thành phần

- Landing tĩnh: `index.html`, `style.css`, `script.js`; đọc fallback từ `data.js` và endpoint từ `config.js`.
- Content/Admin Web App: `apps-script/content-admin`; public content, session, role, CRUD và audit.
- Booking/Payment Web App: `apps-script/booking-payment`; tạo đơn, tính tiền server-side, email, trạng thái thanh toán.
- Admin CMS: `admin/`; token chỉ lưu trong `sessionStorage`.
- Payment/thank-you: chỉ nhận `orderId` opaque trên URL, không nhận PII hoặc amount từ query string.

## Ranh giới tin cậy

Browser và dữ liệu gửi từ browser là không tin cậy. Booking backend luôn tra `packageCode`, tính giá và discount lại. API admin kiểm tra session và role trên server. Public content response dùng allowlist và không trả dữ liệu `Admin Users`, audit hoặc Script Properties.

## Trạng thái hiện tại

Payment thủ công đã có contract và UI. Payment webhook bị khóa ở `NOT_IMPLEMENTED` cho đến khi có provider cụ thể và triển khai xác thực chữ ký của provider đó.

