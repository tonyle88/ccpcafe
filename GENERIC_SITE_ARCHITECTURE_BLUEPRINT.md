# Blueprint kiến trúc website dịch vụ có trang quản trị

Cập nhật: 20/07/2026

## 1. Mục đích và phạm vi

Tài liệu này mô tả một kiến trúc có thể tái sử dụng cho website dịch vụ mới. Nội dung, tên thương hiệu, tên gói, hình ảnh và màu sắc có thể thay đổi hoàn toàn, nhưng kiến trúc vận hành được giữ nguyên.

Phạm vi gồm:

- Landing page nhiều section, nội dung lấy động từ Google Sheet.
- Trang quản trị nội dung và gói dịch vụ.
- Form đăng ký/đặt lịch.
- Thanh toán thủ công hoặc tự động qua webhook.
- Email xác nhận và thông báo vận hành.
- Phân quyền, audit log, health check.
- Sao lưu, phục hồi và lịch sao lưu tự động.
- Hosting frontend tĩnh với security headers và CSP.

Không bao gồm blog, bài viết, chủ đề hoặc hệ thống xuất bản nội dung dài.

## 2. Kiến trúc tổng thể

Hệ thống chia thành ba khối độc lập:

| Khối | Trách nhiệm | Công nghệ đề xuất |
| --- | --- | --- |
| Frontend công khai | Hiển thị landing, gói dịch vụ, form đăng ký, payment và thank-you | HTML, CSS, JavaScript thuần; hosting tĩnh |
| Admin CMS | Đăng nhập, sửa nội dung, gói, menu, thứ tự section, cấu hình vận hành và backup | HTML, CSS, JavaScript thuần |
| Backend dữ liệu | API public, API admin, booking, email, payment webhook và Google Sheet | Hai Google Apps Script Web App độc lập |

Luồng phụ thuộc:

```text
Khách truy cập
  -> Frontend tĩnh
     -> Content API: nội dung, menu, section, gói, cấu hình public
     -> Booking API: tạo đăng ký, kiểm tra thanh toán

Quản trị viên
  -> Admin CMS
     -> Content/Admin API: đăng nhập, chỉnh sửa, audit, backup
     -> Booking health proxy: kiểm tra hệ thống booking/payment

Cổng thanh toán
  -> Booking Web App webhook
     -> cập nhật đơn trong Google Sheet
     -> frontend polling nhận trạng thái mới
```

## 3. Cấu trúc thư mục khuyến nghị

```text
project-root/
├── index.html                 # Landing page và form đăng ký
├── style.css                  # Giao diện landing
├── script.js                  # Nội dung động, package, booking UI, hiệu ứng
├── payment.html               # Trang thanh toán
├── payment.css
├── payment.js
├── thankyou.html              # Trang hoàn tất
├── thankyou.css
├── thankyou.js
├── admin/
│   ├── index.html             # Admin shell và các panel
│   ├── style.css
│   ├── app.js                 # Session, API, render và thao tác quản trị
│   └── redirect.js            # Redirect an toàn nếu cần
├── assets/
│   ├── images/
│   ├── icons/
│   └── audio/
├── apps-script/
│   ├── content-admin.gs       # Content/Admin Web App
│   └── booking-payment.gs     # Booking/Payment Web App
├── migration-kit/
│   ├── sample-content.csv
│   ├── sample-packages.csv
│   └── sample-bookings.csv
├── vercel.json                # Headers/CSP nếu dùng Vercel
├── ARCHITECTURE.md
└── DEPLOYMENT_RUNBOOK.md
```

Frontend không cần build pipeline. Có thể triển khai nguyên thư mục lên nền tảng static hosting.

## 4. Phân tách hai Apps Script

### 4.1 Content/Admin Web App

Chịu trách nhiệm:

- Public read cho landing.
- Đăng nhập và session admin.
- CRUD nội dung, menu, section và gói dịch vụ.
- Quản lý tài khoản admin/editor.
- Audit log.
- Health check của content system.
- Proxy health check sang Booking Web App.
- Backup, restore và trigger backup tự động.

Không xử lý booking hoặc webhook thanh toán trực tiếp.

### 4.2 Booking/Payment Web App

Chịu trách nhiệm:

- Nhận form đăng ký.
- Validate dữ liệu ở server.
- Tạo mã đơn và số tiền chính xác từ cấu hình server.
- Ghi booking vào Sheet.
- Gửi email cho khách và người vận hành.
- Trả trạng thái thanh toán cho trang payment.
- Nhận webhook từ cổng thanh toán.
- Xác nhận thủ công nếu chế độ thủ công được bật.
- Health check riêng cho booking, email và payment.

Việc tách hai Web App giúp lỗi booking/payment không làm hỏng CMS và giảm quyền truy cập chéo.

## 5. Mô hình Google Sheet

Nên dùng hai spreadsheet riêng: một file cho nội dung/admin và một file cho booking/payment.

### 5.1 Spreadsheet nội dung/admin

Các tab tối thiểu:

```text
Content
Service Packages
Navigation
Section Order
Custom Sections
Admin Users
Audit Log
Backup Log
```

Header đề xuất:

```text
Content:
Enabled | Key | Section | Description | Selector | Type | Attribute | Value | Updated At | Updated By

Service Packages:
Enabled | Code | Name | Online Price | Offline Price | Unit | Icon | Accent | Featured | Badge | Duration | Features | Note | Booking Note | Button | Order | Updated At | Updated By

Navigation:
Key | Label | Href | Enabled | Order | Type | Updated At | Updated By

Section Order:
Section Key | Order | Visible

Custom Sections:
Enabled | ID | Section Label | Title | Summary | HTML Content | Navigation Label | Order | Updated At | Updated By

Admin Users:
Username | Password Hash | Role | Status | Display Name | Created At | Updated At | Last Login

Audit Log:
Timestamp | Action | Status | Username | Role | Target Type | Target ID | Details | Message

Backup Log:
Timestamp | Type | Status | Username | File ID | File Name | File URL | Details | Message
```

### 5.2 Spreadsheet booking/payment

Các tab tối thiểu:

```text
Bookings
Email Log
Error Log
```

Header booking đề xuất:

```text
Created At | Customer Name | Phone | Email | Service Format | Package Code | Package Name | Topic | Order ID | Amount | Currency | Status | Transfer Content | Payment Transaction ID | Paid Amount | Paid At | Owner Email
```

Không dùng tên gói hoặc số tiền do frontend gửi lên làm nguồn tin duy nhất. Backend phải đối chiếu `Package Code` với dữ liệu gói hợp lệ trước khi tạo đơn.

## 6. Hợp đồng dữ liệu nội dung

Mỗi mục nội dung dùng một `Key` ổn định, ví dụ:

```text
hero.title
hero.description
benefits.item.1.title
contact.heading
settings.payment.enabled
settings.manualPayment.accountNo
```

Tên hiển thị, selector CSS và giá trị có thể đổi theo dự án; `Key` nên ổn định để frontend và admin không phụ thuộc vào câu chữ.

Các kiểu dữ liệu nên hỗ trợ:

- `text`: nội dung văn bản ngắn.
- `textarea`: đoạn văn dài.
- `html`: nội dung rich text đã sanitize.
- `image`: URL ảnh được kiểm tra.
- `boolean`: bật/tắt.
- `number`: số có giới hạn hợp lệ.
- `color`: màu theo allowlist hoặc định dạng hợp lệ.
- `config`: cấu hình không chứa secret.

## 7. Gói dịch vụ

Một gói dịch vụ nên có:

- Mã định danh không đổi sau khi tạo.
- Tên hiển thị có thể sửa.
- Giá theo từng hình thức phục vụ.
- Thời lượng và đơn vị.
- Danh sách quyền lợi.
- Ghi chú chung.
- Ghi chú đặt lịch riêng, chỉ hiện khi khách chọn gói tương ứng.
- Trạng thái bật/tắt.
- Thứ tự hiển thị.
- Cờ nổi bật, nhãn và màu nhấn.

Quy tắc UI:

1. Khi chưa chọn hình thức phục vụ, dropdown gói bị khóa.
2. Sau khi chọn hình thức, chỉ hiển thị gói có giá hợp lệ cho hình thức đó.
3. Khi khách bấm một gói ở bảng giá, form tự chọn đúng hình thức và gói.
4. Khi đổi hình thức, gói không còn hợp lệ phải được reset.
5. `Booking Note` thay đổi theo gói và có thể sửa trong admin.
6. Backend luôn tính lại số tiền từ package code.

## 8. Landing page

Landing gồm các section độc lập. Danh sách cụ thể tùy dự án, ví dụ:

```text
Header / Navigation
Hero
Giới thiệu
Vấn đề khách hàng
Lợi ích
Quy trình
Bảng giá
Ưu đãi
Đánh giá khách hàng
FAQ
Form đăng ký
Footer
```

Mỗi section cần:

- Một `section key` ổn định.
- Trạng thái hiển thị.
- Thứ tự độc lập với menu.
- Nội dung lấy từ content API.
- Fallback local để trang không trắng khi API lỗi.

Menu và thứ tự section là hai nguồn dữ liệu khác nhau. Menu có thể trỏ tới section, URL ngoài hoặc hành động đặc biệt mà không buộc mọi section phải có menu.

## 9. Admin CMS

Admin nên là single-page interface với các vùng:

- Đăng nhập.
- Dashboard trạng thái.
- Quản lý nội dung theo section.
- Quản lý menu.
- Quản lý thứ tự và bật/tắt section.
- Quản lý gói dịch vụ.
- Quản lý tài khoản.
- Health check content/booking.
- Backup/restore/schedule.

Vai trò:

| Role | Quyền |
| --- | --- |
| `admin` | Toàn quyền, quản lý tài khoản, backup và restore |
| `editor` | Chỉnh nội dung, menu, section và gói; không quản lý quyền hoặc backup |

Session token lưu trong `sessionStorage`, không lưu password. Khi đăng nhập sai, giữ username nhưng xóa và focus lại ô password.

Sau mọi thao tác ghi:

1. API trả thành công.
2. Xóa cache public liên quan.
3. Tải lại đúng nhóm dữ liệu vừa sửa.
4. Render lại panel.
5. Hiển thị toast thành công hoặc lỗi có thể hiểu được.

## 10. API đề xuất

### 10.1 Public read API

```text
getPublicContent
getPublicConfig
listPublicPackages
getPublicNavigation
getPublicSections
```

Public API chỉ trả dữ liệu đang bật và không bao giờ trả user, password hash, audit log, secret hoặc cấu hình nội bộ.

### 10.2 Admin API

```text
login
adminInit
listContent / saveContent
listPackages / savePackage / deletePackage / reorderPackages
listNavigation / saveNavigation
listSections / saveSection / reorderSections
listUsers / createUser / changePassword / changeUserStatus
healthCheck
bookingHealthCheck
getBackupStatus / createBackup / restoreBackup / toggleBackupSchedule
```

Các API quản trị dùng POST, yêu cầu token và kiểm tra role tại server. Không dựa vào việc ẩn nút ở frontend để bảo vệ quyền.

### 10.3 Booking/payment API

```text
register
checkPayment
manualConfirm
bookingHealthCheck
paymentWebhook
```

Webhook phải xác thực secret/signature, hỗ trợ idempotency và không cập nhật nhầm đơn khi nhận lại cùng một giao dịch.

## 11. Luồng booking và thanh toán

### 11.1 Đăng ký

```text
Khách nhập form
  -> frontend validate cơ bản
  -> Booking API validate lại
  -> tra package code và giá server-side
  -> tạo Order ID duy nhất
  -> ghi Bookings
  -> gửi email/log
  -> chuyển sang payment page
```

### 11.2 Thanh toán thủ công

```text
Payment page
  -> hiển thị QR + nội dung chuyển khoản theo Order ID
  -> khách xác nhận đã chuyển
  -> API ghi trạng thái chờ đối soát
  -> admin hoặc quy trình vận hành xác nhận
```

### 11.3 Thanh toán tự động

```text
Cổng thanh toán gọi webhook
  -> xác thực secret/signature
  -> tìm Order ID từ nội dung giao dịch
  -> kiểm tra số tiền và trạng thái hiện tại
  -> cập nhật Paid đúng một lần
  -> payment page polling nhận Paid
  -> chuyển thank-you page
```

## 12. Backup và restore

Script Property `BACKUP_FOLDER_ID` trỏ tới thư mục Drive do tài khoản sở hữu Web App quản lý.

Backup thủ công:

- Chỉ `admin` được tạo và xem liên kết.
- Giới hạn tối thiểu hai phút giữa hai lần tạo.
- Ghi cả thành công và lỗi vào `Backup Log`.
- Bản copy có timestamp và loại backup trong tên.

Restore:

- Yêu cầu chuỗi xác nhận chính xác, ví dụ `RESTORE`.
- Kiểm tra file nằm trong đúng thư mục backup.
- Kiểm tra đủ các sheet nghiệp vụ cần thiết.
- Tạo bản `Before-Restore-*` trước khi ghi đè.
- Chỉ phục hồi sheet nội dung và gói.
- Giữ nguyên `Admin Users`, `Audit Log`, `Backup Log`, spreadsheet ID, Script Properties, source code và deployment URL.

Backup tự động:

- Trigger chạy hàng tuần trong khung giờ ít truy cập.
- Giữ một số lượng bản gần nhất, ví dụ 12.
- Bỏ qua file đã gắn sao khi retention dọn bản cũ.
- Cho phép bật/tắt lịch trong admin nhưng chỉ sau khi chủ deployment cấp quyền Drive và ScriptApp.

## 13. Cache và đồng bộ

- Public API có cache ngắn để giảm lượt đọc Sheet.
- Admin không đọc cache sau thao tác ghi.
- Sau lưu nội dung/gói/menu/section, backend xóa cache tương ứng.
- Frontend có fallback local hoặc cache gần nhất để tránh trang trắng.
- Asset frontend dùng cache-busting theo release, ví dụ `app.js?v=20260720-r1`.
- Không thay version cache nếu file không đổi.

## 14. Bảo mật

### 14.1 Secret

Chỉ lưu trong Apps Script Properties hoặc secret manager:

```text
ADMIN_BOOTSTRAP_PASSWORD
BOOKING_WEB_APP_URL
BOOKING_HEALTH_SECRET
PAYMENT_WEBHOOK_SECRET
BACKUP_FOLDER_ID
```

Không đưa secret, token, Sheet ID nhạy cảm, private key hoặc password vào Git, tài liệu phát hành, log hay response public.

### 14.2 Nội dung và request

- Sanitize HTML rich text tại server trước khi lưu hoặc trước khi render.
- Escape text/attribute khi render admin bằng template string.
- Validate URL ảnh và giới hạn MIME type/kích thước upload.
- Giới hạn độ dài input.
- Kiểm tra role server-side cho mọi API admin.
- Không ghi token, password, base64 ảnh hoặc HTML dài vào audit log.
- Rate limit login, backup và các thao tác nhạy cảm.

### 14.3 Security headers

Các header nền tảng:

```text
Strict-Transport-Security
Content-Security-Policy
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy
```

CSP nên tách theo route:

- `payment` và `thank-you`: nghiêm nhất, không inline script/style.
- landing: allowlist đúng font, ảnh, API và iframe thật sự sử dụng.
- admin: cho phép nguồn editor cần thiết; nếu rich text dùng style attribute để giữ màu/căn lề thì chỉ nới `style-src-attr`, không nới `script-src`.

JavaScript không tạo `<style>` động nếu CSP không cho phép. Animation động nên dùng class CSS định sẵn hoặc Web Animations API.

## 15. Health check và log

Content health check xác nhận:

- Spreadsheet truy cập được.
- Đủ sheet và header.
- Backup folder hợp lệ.
- Quyền trigger và số trigger đúng.
- Lịch, retention và lần backup gần nhất.

Booking health check xác nhận:

- Booking Sheet truy cập được.
- Đủ cột bắt buộc.
- Email nhận thông báo đã cấu hình.
- Payment mode hợp lệ.
- Webhook secret có mặt khi bật payment tự động.

Log cần giữ:

- `Audit Log`: ai làm gì, lúc nào, kết quả nào.
- `Backup Log`: loại backup, file, kết quả, lỗi.
- `Email Log`: loại email, người nhận, order, trạng thái.
- `Error Log`: nguồn lỗi, action, message và thời điểm.

## 16. Triển khai dự án mới

### Giai đoạn A — Khởi tạo

1. Copy bộ khung nhưng loại toàn bộ tên, ảnh, URL và cấu hình dự án cũ.
2. Tạo hai Google Spreadsheet mới.
3. Tạo hai Apps Script project mới và gắn đúng spreadsheet.
4. Tạo thư mục backup bằng tài khoản sở hữu deployment.
5. Khai báo Script Properties bằng secret mới.

Tiêu chí đạt: không còn ID, URL, email, secret hoặc tên thương hiệu của dự án nguồn.

### Giai đoạn B — Dữ liệu và backend

1. Tạo sheet/header chuẩn.
2. Nạp nội dung và gói mẫu của dự án mới.
3. Deploy Content/Admin Web App.
4. Deploy Booking/Payment Web App.
5. Chạy hai health check.
6. Thử login, đọc public API và tạo booking test.

Tiêu chí đạt: API trả đúng schema, quyền admin/editor đúng và booking test ghi đủ cột.

### Giai đoạn C — Frontend và admin

1. Thay bộ nhận diện, nội dung fallback và asset.
2. Cấu hình URL hai Web App tại một nguồn cấu hình release.
3. Map section/key mới.
4. Cấu hình package/form/payment.
5. Kiểm tra CSP allowlist theo đúng domain mới.
6. Deploy frontend staging.

Tiêu chí đạt: không có lỗi console blocking, CSP violation không chủ ý, asset 404 hoặc section trống.

### Giai đoạn D — QA nghiệp vụ

1. Admin login sai/đúng, session và logout.
2. Sửa nội dung, menu, section và package.
3. Kiểm tra landing nhận dữ liệu mới sau cache.
4. Test booking online/offline hoặc các hình thức tương đương.
5. Test payment thủ công.
6. Test webhook tự động bằng dữ liệu test.
7. Kiểm tra email và các log.
8. Tạo backup và restore trên bản staging/copy.

Tiêu chí đạt: tất cả luồng P0/P1 hoàn tất trước production.

### Giai đoạn E — Production

Thứ tự phát hành:

1. Sao lưu dữ liệu và ghi lại version/URL cũ.
2. Deploy Content/Admin backend.
3. Chạy content health check.
4. Deploy Booking/Payment backend.
5. Chạy booking health check.
6. Deploy frontend tĩnh.
7. Smoke test production trên mobile và desktop.
8. Bật payment tự động sau cùng.
9. Theo dõi log ngay sau deploy và sau 24 giờ.

## 17. QA checklist rút gọn

### Landing

- [ ] Menu và thứ tự section đúng.
- [ ] Nội dung fallback hoạt động khi API tạm lỗi.
- [ ] Gói dịch vụ đúng tên, giá, hình thức và trạng thái.
- [ ] Bấm gói đồng bộ đúng vào form.
- [ ] Mobile không tràn ngang, đè chữ hoặc che CTA.
- [ ] Hiệu ứng không bị CSP chặn và tôn trọng reduced motion.

### Admin

- [ ] Sai password xóa ô password và vẫn giữ username.
- [ ] Admin/editor nhìn thấy đúng chức năng.
- [ ] Lưu nội dung và package tải lại đúng dữ liệu.
- [ ] Thêm/xóa/đổi thứ tự package hoạt động.
- [ ] Rich text giữ đúng định dạng được cho phép.
- [ ] Audit log không chứa dữ liệu nhạy cảm.

### Booking/payment

- [ ] Client và server cùng validate trường bắt buộc.
- [ ] Backend tính lại giá từ package code.
- [ ] Order ID duy nhất.
- [ ] Webhook sai secret bị từ chối.
- [ ] Webhook lặp không ghi thanh toán hai lần.
- [ ] Polling dừng khi thành công hoặc hết thời gian.
- [ ] Email và log phản ánh đúng kết quả.

### Backup/restore

- [ ] Folder ID và quyền Drive hợp lệ.
- [ ] Manual backup tạo file và log.
- [ ] Cooldown hoạt động.
- [ ] Restore chỉ nhận file trong folder được phép.
- [ ] Có pre-restore backup.
- [ ] User và audit hiện tại không bị ghi đè.
- [ ] Trigger và retention đúng.

## 18. Rollback

Rollback khi mất booking, sai tiền/trạng thái, lộ secret, admin không đăng nhập được hoặc site không tải:

1. Tắt payment tự động nếu liên quan giao dịch.
2. Trả frontend về release trước.
3. Chuyển Apps Script về version/deployment trước.
4. Chỉ restore Sheet khi schema/dữ liệu bị hỏng.
5. Không ghi đè booking hợp lệ phát sinh sau thời điểm backup.
6. Đối soát giao dịch và email trong khoảng thời gian sự cố.

## 19. Các điểm cần thay cho mỗi dự án

Phải thay:

- Tên thương hiệu, logo, font, palette và asset.
- Domain và hosting project.
- Hai spreadsheet và Apps Script project.
- Deployment URL.
- Tài khoản/email vận hành.
- Script Properties và toàn bộ secret.
- Tên section, content key và dữ liệu mẫu.
- Package code, tên, giá, thời lượng và booking note.
- Tài khoản ngân hàng, payment provider và webhook config.
- CSP allowlist.

Có thể giữ nguyên:

- Phân tách frontend/admin/content API/booking API.
- Cơ chế key-value cho content.
- Schema role và session.
- CRUD package và đồng bộ vào booking form.
- Health check, audit, backup/restore và retention.
- Quy trình backend-first khi deploy.
- QA, rollback và nguyên tắc không lưu secret trong Git.

## 20. Cải tiến nên làm ngay ở dự án mới

- Gom URL/config môi trường vào một file cấu hình phát hành duy nhất.
- Thêm smoke test public API và kiểm tra asset/CSP vào CI.
- Dùng release ID thống nhất cho cache-busting.
- Tạo dữ liệu staging riêng, không test trên booking thật.
- Viết test cho package filtering, amount calculation và webhook idempotency.
- Tạo runbook cho booking lỗi, email lỗi, webhook lặp và restore Sheet.
- Chỉ cấp scope Google tối thiểu cần thiết cho từng Apps Script.

Blueprint này là hợp đồng kiến trúc. Nội dung nghiệp vụ có thể thay hoàn toàn mà không cần thay cách phân lớp, luồng quyền, backup hoặc thứ tự triển khai.
