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
3. Trong Script Properties đặt `BOOKING_SPREADSHEET_ID`, `PAYMENT_BANK_NAME`, `PAYMENT_ACCOUNT_NAME`, `PAYMENT_ACCOUNT_NO`. Không ghi các giá trị vào source.
4. Chạy `setupBookingSpreadsheet()`.
5. `OWNER_EMAIL` có thể để trống; hệ thống mặc định dùng email của tài khoản deploy. Chưa đặt webhook secret khi chưa có provider.
6. Deploy Web App và kiểm tra `?action=health`.
7. Tạo booking synthetic và xác nhận đủ cột, số tiền, email/log.

## 4. Frontend staging

1. Trong Vercel → Project Settings → Environment Variables, tạo `CONTENT_API_URL` với giá trị là Content/Admin Web App deployment URL kết thúc bằng `/exec`. Áp dụng cho Production, Preview và Development theo nhu cầu.
2. Không cần ghi Content API URL vào source. `/api/config` chỉ trả URL public này cho browser lúc chạy; không trả secret.
3. Trong Content/Admin Script Properties, đặt `BOOKING_WEB_APP_URL` để public content response cung cấp Booking API URL cho landing.
4. Đặt `environment: 'staging'`, cập nhật `releaseId` và giữ `paymentEnabled: false` tới khi đối soát xong.
5. Redeploy sau khi thêm/chỉnh Environment Variable; kiểm tra `/api/config` trả `contentApiUrl` khác rỗng.
6. Với Spreadsheet đã setup từ release cũ, chạy lại `setupContentSpreadsheet()` để append các content key còn thiếu; hàm giữ nguyên key đã có.
7. Kiểm tra landing thực sự gọi `publicInit`, sau đó sửa thử một content key trên Sheet/Admin và xác nhận landing đổi sau khi cache được xóa.
8. Kiểm tra CSP console, asset 404 và CORS.
9. Test landing → booking → payment → manual confirm trên mobile và desktop.

## 5. Production

1. Tạo hai Spreadsheet và hai deployment production mới; không dùng lại staging.
2. Deploy Content/Admin, chạy health; deploy Booking/Payment, chạy health.
3. Deploy frontend với URL production và release ID mới.
4. Smoke test một booking được đánh dấu rõ là test và xử lý theo quy trình dữ liệu thử.
5. Theo dõi `Audit Log`, `Email Log`, `Error Log` ngay sau deploy và sau 24 giờ.

## 6. Rollback

1. Tắt/giữ `paymentEnabled: false` nếu liên quan giao dịch.
2. Trả frontend về release trước.
3. Chuyển Apps Script về deployment/version trước.
4. Chỉ restore Sheet khi schema/dữ liệu hỏng; không ghi đè booking hợp lệ phát sinh sau backup.

## Giới hạn bằng chứng egress

Changelog/tài liệu nhà cung cấp không chứng minh không có egress. Chỉ kết luận về dữ liệu rời máy sau khi có network evidence từ proxy, firewall hoặc network log được tổ chức phê duyệt trong chính môi trường staging/production.
