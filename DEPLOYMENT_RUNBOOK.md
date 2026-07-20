# Deployment Runbook

## 1. Điều kiện trước khi deploy

1. Dùng dữ liệu synthetic cho staging; không sao chép booking thật.
2. Chạy `npm run check` và `npm test`.
3. Kiểm tra working tree/history không chứa secret. Nếu secret từng được commit, thu hồi/xoay vòng trước khi xử lý history.
4. Chốt bốn gói, giá, discount, email vận hành và thông tin thanh toán.

## 2. Content/Admin Apps Script

1. Tạo Spreadsheet staging mới.
2. Tạo Apps Script gắn với Spreadsheet, chép file trong `apps-script/content-admin/`.
3. Trong Script Properties đặt `CONTENT_SPREADSHEET_ID` và, sau khi booking deploy, `BOOKING_WEB_APP_URL`. Không ghi hai giá trị này vào source.
4. Chạy `setupContentSpreadsheet()` một lần.
5. Trong Script Properties, đặt tạm `ADMIN_BOOTSTRAP_USERNAME` và `ADMIN_BOOTSTRAP_PASSWORD` tối thiểu 12 ký tự.
6. Chạy `bootstrapAdminFromProperties()`. Hàm sẽ xóa property mật khẩu sau khi tạo user.
7. Deploy Web App: execute as owner; quyền truy cập phù hợp với public landing.
8. Mở `?action=health`, sau đó thử `?action=publicInit` và xác nhận response không có user/hash/secret.

## 3. Booking/Payment Apps Script

1. Tạo Spreadsheet staging khác và Apps Script gắn với file đó.
2. Chép file trong `apps-script/booking-payment/`.
3. Trong Script Properties đặt `BOOKING_SPREADSHEET_ID`, `PAYMENT_BANK_CODE` (BIN hoặc mã ngân hàng VietQR), `PAYMENT_BANK_NAME`, `PAYMENT_ACCOUNT_NAME`, `PAYMENT_ACCOUNT_NO`. Không ghi các giá trị vào source.
4. Chạy `setupBookingSpreadsheet()`.
5. Chọn một trong hai chế độ:
   - Không dùng SePay: đặt `PAYMENT_MODE=manual`; không cần webhook secret. Khách quét VietQR rồi bấm yêu cầu đối soát thủ công.
   - Có SePay: đặt `PAYMENT_MODE=sepay` và tạo `PAYMENT_WEBHOOK_SECRET` ngẫu nhiên, dài tối thiểu 32 byte. Secret này phải trùng giá trị trong Vercel, không gửi cho SePay và không đưa vào Git.
6. `OWNER_EMAIL` có thể để trống; hệ thống mặc định dùng email của tài khoản deploy. Đặt thêm `PUBLIC_SITE_URL=https://<domain>` để email xác nhận có nút quay lại trang thanh toán; không có dấu `/` cuối.
7. Deploy Web App và kiểm tra `?action=health`. Chạy lại `setupBookingSpreadsheet()` khi nâng cấp để append cột `Payment Mode` mà không xóa dữ liệu cũ.
8. Tạo booking synthetic và xác nhận đủ cột, số tiền, email/log.

## 4. Frontend staging

1. Trong Vercel → Project Settings → Environment Variables, tạo `CONTENT_API_URL` và `BOOKING_API_URL` với giá trị là hai Apps Script Web App deployment URL tương ứng, đều kết thúc bằng `/exec`. Áp dụng cho Production, Preview và Development theo nhu cầu.
2. Không cần ghi Content API URL vào source. `/api/config` chỉ trả URL public này cho browser lúc chạy; không trả secret.
3. Trong Content/Admin Script Properties, đặt `BOOKING_WEB_APP_URL` để public content response cung cấp Booking API URL cho landing.
   Có thể cấu hình cùng giá trị này tại Admin → Bảng điều khiển → Kết nối form đặt lịch; chức năng chỉ dành cho tài khoản admin và lưu vào Script Properties.
4. Đặt `environment: 'staging'`, cập nhật `releaseId` và giữ `paymentEnabled: false` tới khi đối soát xong.
5. Redeploy sau khi thêm/chỉnh Environment Variable; kiểm tra `/api/config` trả cả `contentApiUrl` và `bookingApiUrl` khác rỗng trên đúng deployment Production.
6. Với Spreadsheet đã setup từ release cũ, chạy lại `setupContentSpreadsheet()` để append các content key còn thiếu; hàm giữ nguyên key đã có.
7. Kiểm tra landing thực sự gọi `publicInit`, sau đó sửa thử một content key trên Sheet/Admin và xác nhận landing đổi sau khi cache được xóa.
8. Kiểm tra CSP console, asset 404 và CORS.
9. Test landing → booking → payment → manual confirm trên mobile và desktop.

## 5. SePay webhook (chỉ khi `PAYMENT_MODE=sepay`)

1. Trong Vercel đặt `SEPAY_API_KEY` và `PAYMENT_WEBHOOK_SECRET`; `PAYMENT_WEBHOOK_SECRET` phải trùng Script Property của Booking/Payment Apps Script. Redeploy sau khi đổi biến.
2. Trong SePay tạo webhook URL `https://<domain>/api/sepay-webhook`, sự kiện **Có tiền vào**, content type **JSON**, xác thực **API Key**. Giá trị API Key phải trùng `SEPAY_API_KEY` trong Vercel.
3. Cấu hình tiền tố mã thanh toán `CCP`; mã đơn mới có dạng `CCP` + 10 ký tự để phù hợp nội dung chuyển khoản. Backend vẫn đọc được mã đơn dài của release cũ.
4. Dùng Test Mode/Gửi thử của SePay với booking synthetic: sai account hoặc sai amount phải bị từ chối; payload gửi lại cùng `id` không được ghi nhận hai lần; đúng amount và mã đơn phải chuyển `PENDING_PAYMENT`/`PAYMENT_REVIEW` sang `PAID`.
5. Chỉ bật `paymentEnabled` sau khi kiểm thử end-to-end, health báo `paymentConfigured=true`, `paymentMode=sepay`, `sepayConfigured=true`.

QR VietQR tải từ `img.vietqr.io` và chứa mã ngân hàng, số tài khoản, tên tài khoản, số tiền, nội dung chuyển khoản. Đây không phải secret nhưng là egress tới nhà cung cấp QR; cần đưa domain này vào đánh giá/network log của môi trường production.

## 6. Production

1. Tạo hai Spreadsheet và hai deployment production mới; không dùng lại staging.
2. Deploy Content/Admin, chạy health; deploy Booking/Payment, chạy health.
3. Deploy frontend với URL production và release ID mới.
4. Smoke test một booking được đánh dấu rõ là test và xử lý theo quy trình dữ liệu thử.
5. Theo dõi `Audit Log`, `Email Log`, `Error Log` ngay sau deploy và sau 24 giờ.

## 7. Rollback

1. Tắt/giữ `paymentEnabled: false` nếu liên quan giao dịch.
2. Trả frontend về release trước.
3. Chuyển Apps Script về deployment/version trước.
4. Chỉ restore Sheet khi schema/dữ liệu hỏng; không ghi đè booking hợp lệ phát sinh sau backup.

## Giới hạn bằng chứng egress

Changelog/tài liệu nhà cung cấp không chứng minh không có egress. Chỉ kết luận về dữ liệu rời máy sau khi có network evidence từ proxy, firewall hoặc network log được tổ chức phê duyệt trong chính môi trường staging/production.
