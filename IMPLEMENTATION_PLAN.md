# Kế hoạch triển khai Cafe-CCP

Ngày lập: 20/07/2026  
Tài liệu tham chiếu: `GENERIC_SITE_ARCHITECTURE_BLUEPRINT.md`

## 1. Mục tiêu dự án

Nâng landing page Clow Cat Patronus × The Comma hiện tại thành hệ thống có thể vận hành thực tế, gồm:

- Landing page tải nội dung và gói dịch vụ động, nhưng vẫn có fallback cục bộ khi API lỗi.
- Form đặt lịch ghi nhận booking thật, xác thực dữ liệu ở server và gửi email vận hành.
- Trang quản trị cho nội dung, menu, section, gói dịch vụ, tài khoản, log và backup.
- Luồng thanh toán thủ công trước; webhook tự động được triển khai sau khi luồng booking ổn định.
- Hai Google Apps Script Web App và hai Google Spreadsheet độc lập cho content/admin và booking/payment.
- Staging tách khỏi production, có health check, backup, rollback và security headers.

## 2. Hiện trạng đã rà soát

### 2.1 Thành phần đang có

- `index.html`: landing page 575 dòng, gồm `hero`, `about`, `instructor`, `packages`, `process`, `feedback`, `book` và footer.
- `style.css`: 2.303 dòng, responsive tại các breakpoint 1024/900/768/480 px; có nhiều animation và hiệu ứng con trỏ.
- `script.js`: 387 dòng, xử lý hiệu ứng, navigation, carousel, package selection và form.
- Tài nguyên khoảng 17 MB trong `hinh/`, `icons/` và thư mục mẫu.
- Bốn gói hiện được hard-code ở cả card, vùng tóm tắt, dropdown và JavaScript: `kham-pha`, `ket-noi`, `toan-dien`, `3in1`.
- Landing dùng Google Fonts, YouTube iframe và liên kết Facebook/Instagram/TikTok/YouTube.

### 2.2 Khoảng trống so với blueprint

- Form hiện chỉ kiểm tra rỗng, dựng tin nhắn và mở Facebook Messenger; chưa lưu booking, chưa có trạng thái đơn và chưa gửi email.
- Chưa có lựa chọn hình thức phục vụ, ngày/giờ mong muốn, số người, điều khoản đồng ý hoặc chống submit lặp.
- Giá và tên gói bị lặp ở nhiều vị trí; chưa có nguồn dữ liệu duy nhất và backend chưa tính lại giá.
- Chưa có `payment.html`, `thankyou.html`, admin CMS hoặc Apps Script.
- Chưa có content API, booking API, authentication, role, audit log, health check, backup/restore.
- Chưa có cấu hình môi trường, staging, security headers/CSP, CI hoặc test tự động.
- Chưa có Git repository trong chính thư mục dự án; chưa có lịch sử phiên bản để rollback.
- Chưa thấy file secret theo tên phổ biến. Kết luận này chỉ dựa trên tên file, không phải secret scan nội dung đầy đủ.
- Asset lớn nhất gồm favicon khoảng 4,2 MB, poster khoảng 3,3 MB và background khoảng 2,7 MB; cần tối ưu trước production.
- CSS có inline styles trong HTML và JavaScript tạo `<style>` động, nên cần refactor trước khi bật CSP nghiêm.
- Chưa thấy xử lý `prefers-reduced-motion`; hiệu ứng dày có thể ảnh hưởng accessibility và thiết bị yếu.

## 3. Kiến trúc đích cho dự án

```text
Khách truy cập
  -> Static frontend
     -> Content/Admin Web App: public content, navigation, sections, packages
     -> Booking/Payment Web App: register, payment status

Quản trị viên
  -> /admin
     -> Content/Admin Web App: login, CRUD, users, audit, backup
     -> booking health proxy

Cổng thanh toán
  -> Booking/Payment Web App webhook
     -> Bookings Sheet
     -> payment page polling
```

Nguyên tắc bắt buộc:

- Hai spreadsheet, hai Apps Script project, hai deployment và bộ quyền độc lập.
- Public API không trả tài khoản, hash, secret, ID nội bộ nhạy cảm hoặc log.
- Backend nhận `packageCode` rồi tự tra gói, giá, giảm giá và số tiền cuối; không tin giá do browser gửi.
- Mọi thao tác admin kiểm tra token và role ở server.
- Secret chỉ nằm trong Apps Script Properties hoặc secret manager, không nằm trong Git hay file cấu hình frontend.
- Staging dùng spreadsheet, deployment URL và tài khoản thử nghiệm riêng.

## 4. Cấu trúc thư mục mục tiêu

```text
Cafe-CCP/
├── index.html
├── style.css
├── script.js
├── config.js.example
├── payment.html
├── payment.css
├── payment.js
├── thankyou.html
├── thankyou.css
├── thankyou.js
├── admin/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── redirect.js
├── assets/
│   ├── images/
│   ├── icons/
│   └── fonts/
├── apps-script/
│   ├── content-admin/
│   │   ├── Code.gs
│   │   ├── Auth.gs
│   │   ├── Content.gs
│   │   ├── Backup.gs
│   │   └── appsscript.json
│   └── booking-payment/
│       ├── Code.gs
│       ├── Booking.gs
│       ├── Payment.gs
│       ├── Email.gs
│       └── appsscript.json
├── migration-kit/
│   ├── content.csv
│   ├── packages.csv
│   ├── navigation.csv
│   └── sections.csv
├── tests/
│   ├── frontend/
│   ├── contracts/
│   └── smoke/
├── vercel.json
├── .gitignore
├── ARCHITECTURE.md
├── DEPLOYMENT_RUNBOOK.md
└── IMPLEMENTATION_PLAN.md
```

`config.js.example` chỉ mô tả schema. File cấu hình release thật phải chứa URL public không nhạy cảm; mọi secret vẫn ở Script Properties.

## 5. Mô hình dữ liệu riêng cho Cafe-CCP

### 5.1 Content/Admin spreadsheet

Tạo các tab: `Content`, `Service Packages`, `Navigation`, `Section Order`, `Custom Sections`, `Admin Users`, `Audit Log`, `Backup Log`.

Các section key ban đầu:

| Section key | Section hiện tại | Có trong menu | Mặc định hiển thị |
| --- | --- | --- | --- |
| `hero` | Hero/CTA | Không | Có |
| `about` | Về dịch vụ | Có | Có |
| `instructor` | Người hướng dẫn | Không | Có |
| `packages` | Gói dịch vụ/ưu đãi | Có | Có |
| `process` | Quy trình | Có | Có |
| `feedback` | Cảm nhận | Có | Có |
| `book` | Form đặt lịch | CTA | Có |
| `footer` | Liên hệ/social | Không | Có |

Content key ưu tiên cho đợt đầu:

- `site.brand`, `site.description`, `hero.badge`, `hero.title`, `hero.slogan`, `hero.subtitle`.
- `about.title`, `about.paragraph.1..3`, `about.topic.1..4`.
- `instructor.name`, `instructor.title`, `instructor.quote`, `instructor.videoUrl`, `instructor.stat.1..4`.
- `packages.heading`, `packages.description`, `packages.extraTimePrice`, `packages.groupDiscount.2`, `packages.groupDiscount.3`.
- `process.heading`, `process.step.1..3`, `feedback.heading`.
- `booking.heading`, `booking.responseSla`, `footer.contactText`, các URL social.
- `settings.booking.enabled`, `settings.payment.mode`, `settings.manualPayment.*` nhưng không chứa secret.

Service package khởi tạo:

| Code | Tên | Giá | Thời lượng | Ghi chú |
| --- | --- | ---: | ---: | --- |
| `kham-pha` | Gói Khám Phá | 300.000 VND | 30 phút | 1 chủ đề |
| `ket-noi` | Gói Kết Nối | 400.000 VND | 45 phút | 2 chủ đề, featured |
| `toan-dien` | Gói Toàn Diện | 550.000 VND | 60 phút | Nhiều chủ đề |
| `3in1` | Tư Vấn 3-in-1 Đặc Biệt | 550.000 VND | 60 phút | Yêu cầu thông tin sinh |

Giá trên chỉ là dữ liệu seed từ landing hiện tại và phải được chủ dự án xác nhận trước production.

### 5.2 Booking/Payment spreadsheet

Tạo `Bookings`, `Email Log`, `Error Log`. Ngoài schema blueprint, bổ sung:

- `Service Format`: tại quán/online hoặc giá trị nghiệp vụ đã chốt.
- `Preferred Date`, `Preferred Time`, `Party Size`.
- `Base Amount`, `Discount Amount`, `Extra Time Amount`, `Final Amount`.
- `Consent Version`, `Source`, `UTM Source/Medium/Campaign` nếu cần đo marketing.
- `Idempotency Key`, `Last Updated At`.

Trạng thái chuẩn:

```text
CREATED -> PENDING_PAYMENT -> PAYMENT_REVIEW -> PAID -> CONFIRMED -> COMPLETED
                         \-> CANCELLED / EXPIRED / REFUNDED
```

Không cho phép frontend tự chuyển trạng thái sang `PAID`, `CONFIRMED` hoặc `REFUNDED`.

## 6. Hợp đồng API phiên bản 1

Tất cả response có envelope thống nhất:

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "requestId": "...",
  "version": "v1"
}
```

### Public Content/Admin Web App

- `GET?action=publicInit`: trả content, navigation, sections, packages và public config trong một request.
- `GET?action=health`: chỉ trả trạng thái tổng quát, không lộ ID hoặc cấu hình nội bộ.
- `POST action=login`: username/password; trả session token có TTL.
- `POST action=adminInit`: trả dữ liệu theo role.
- CRUD content/package/navigation/section/user, audit và backup theo blueprint.

### Booking/Payment Web App

- `POST action=register`: nhận dữ liệu khách, `packageCode`, lựa chọn hợp lệ và idempotency key; trả `orderId`, `amount`, `currency`, `status`, `paymentUrl`.
- `GET?action=checkPayment&orderId=...`: trả trạng thái tối thiểu cần cho khách.
- `POST action=manualConfirm`: chuyển sang `PAYMENT_REVIEW`, không tự đánh dấu đã thanh toán.
- `POST action=paymentWebhook`: xác thực chữ ký/secret, amount, order và tính idempotent.
- `GET?action=health`: kiểm tra sheet, schema, email và payment config.

Chuẩn lỗi tối thiểu: `VALIDATION_ERROR`, `PACKAGE_UNAVAILABLE`, `RATE_LIMITED`, `AUTH_REQUIRED`, `FORBIDDEN`, `ORDER_NOT_FOUND`, `PAYMENT_MISMATCH`, `INTERNAL_ERROR`.

## 7. Kế hoạch theo giai đoạn

### Giai đoạn 0 — Chốt nghiệp vụ và nền tảng (1–2 ngày)

Việc thực hiện:

1. Chốt hình thức phục vụ, lịch làm việc, slot booking, số người, cách tính giảm giá và thêm giờ.
2. Chốt thanh toán MVP là thủ công; chọn nhà cung cấp webhook cho giai đoạn sau.
3. Chốt hosting/domain, email vận hành và tài khoản Google sở hữu deployment.
4. Khởi tạo Git, `.gitignore`, nhánh `main`/`staging`, quy ước version và release ID.
5. Lập inventory dữ liệu/asset; loại thư mục `Mẫu` khỏi artifact production.
6. Tạo staging riêng và quy tắc không dùng dữ liệu khách thật khi test.

Đầu ra: quyết định nghiệp vụ được duyệt, repository có version control, ma trận môi trường và danh sách chủ sở hữu.

Tiêu chí hoàn tất: không còn quyết định P0 mở; không có secret trong working tree hoặc history.

### Giai đoạn 1 — Chuẩn hóa landing và dữ liệu fallback (3–4 ngày)

1. Chuyển `hinh/`, `icons/`, font sang `assets/`; cập nhật đường dẫn có kiểm soát.
2. Nén/resize favicon, background, feedback và poster; dùng WebP/AVIF kèm fallback nếu cần.
3. Tạo model package duy nhất trong JavaScript; render card, vùng tóm tắt và dropdown từ cùng dữ liệu.
4. Gắn `data-content-key`/mapping ổn định cho các trường nội dung.
5. Tách inline style thành class; thay `<style>` động của hiệu ứng bằng class/Web Animations API.
6. Thêm loading/error state, cache gần nhất và fallback local.
7. Thêm validation client rõ ràng, lỗi inline, chống double-submit và trạng thái submit.
8. Bổ sung focus style, keyboard flow, label/error association và `prefers-reduced-motion`.

Đầu ra: landing giữ nguyên thẩm mỹ nhưng có data layer và sẵn sàng kết nối API.

Tiêu chí hoàn tất: bốn gói chỉ có một nguồn dữ liệu; API giả lập lỗi không làm trang trắng; mobile 360/390/768 px không tràn ngang.

### Giai đoạn 2 — Content backend và dữ liệu seed (4–5 ngày)

1. Tạo Content/Admin spreadsheet và header chuẩn bằng script setup chạy idempotent.
2. Tạo migration CSV từ nội dung hiện tại; giữ nguyên thương hiệu, section và bốn gói.
3. Xây `publicInit`, cache có TTL, schema validation và allowlist field public.
4. Xây login/session, password hash, TTL, logout và rate limit cơ bản.
5. Xây role `admin`/`editor` và middleware kiểm tra quyền server-side.
6. Xây CRUD content, navigation, section và package; xóa cache đúng nhóm sau ghi.
7. Ghi audit log đã redact; không log password, token hoặc nội dung dài.
8. Xây content health check.

Đầu ra: Content/Admin Web App staging và bộ seed dữ liệu Cafe-CCP.

Tiêu chí hoàn tất: public API không lộ dữ liệu admin; editor bị chặn API quản lý user/backup; package disabled không xuất hiện public.

### Giai đoạn 3 — Booking MVP và email (4–5 ngày)

1. Tạo Booking spreadsheet và script setup idempotent.
2. Xây `register` với normalize/validate tên, email, điện thoại, package, lịch, topic và giới hạn độ dài.
3. Tính lại giá, discount, extra time và final amount ở server.
4. Tạo Order ID duy nhất và idempotency key để submit lặp không tạo hai đơn.
5. Ghi booking trước, sau đó gửi email; lỗi email không làm mất booking.
6. Tạo email xác nhận khách và email thông báo vận hành; ghi Email/Error Log đã redact.
7. Kết nối landing; chỉ chuyển trang sau khi nhận `orderId` hợp lệ.
8. Xây booking health check và smoke test tạo booking staging.

Đầu ra: khách đặt lịch thật được lưu và đội vận hành nhận thông báo.

Tiêu chí hoàn tất: mọi amount lấy từ server; submit lặp chỉ tạo một booking; lỗi email có log và booking vẫn tồn tại.

### Giai đoạn 4 — Payment thủ công và thank-you (3–4 ngày)

1. Tạo `payment.*`, đọc order qua ID opaque, không đưa PII vào URL.
2. Hiển thị QR/tài khoản/nội dung chuyển khoản và amount từ API.
3. Xây `manualConfirm` chuyển `PENDING_PAYMENT` sang `PAYMENT_REVIEW`.
4. Polling có exponential backoff, giới hạn thời gian, dừng khi terminal state hoặc tab ẩn lâu.
5. Tạo `thankyou.*` với trạng thái thành công/chờ xác nhận/lỗi.
6. Viết hướng dẫn đối soát thủ công cho vận hành.

Đầu ra: luồng booking → chuyển khoản → chờ đối soát → thank-you hoàn chỉnh.

Tiêu chí hoàn tất: reload payment không tạo đơn mới; không thể sửa amount từ URL; khách nhận thông báo dễ hiểu khi polling hết hạn.

Trạng thái triển khai 2026-07-20: đã bổ sung VietQR cho mọi đơn, chế độ `manual` để yêu cầu đối soát thủ công và chế độ `sepay` để xác thực webhook qua Vercel rồi đối soát mã đơn/số tiền/tài khoản/id giao dịch tại Apps Script. Còn cần deploy lại Apps Script/Vercel và chạy giao dịch synthetic trong SePay Test Mode trước khi bật production.

### Giai đoạn 5 — Admin CMS (5–7 ngày)

1. Tạo admin shell, login/logout, sessionStorage và timeout session.
2. Dashboard health content/booking, trạng thái backup và lỗi gần nhất đã lọc.
3. Panel content theo section, preview và validation theo type.
4. Panel package: thêm/sửa/bật-tắt/featured/order/features/booking note.
5. Panel navigation và section order tách biệt.
6. Panel user chỉ cho admin; không hiển thị hash.
7. Toast/error có request ID; sau ghi phải reload đúng resource.
8. Bảo vệ XSS: escape mặc định; rich HTML dùng allowlist sanitizer phía server và client.

Đầu ra: admin/editor tự quản lý landing mà không sửa mã.

Tiêu chí hoàn tất: ma trận quyền vượt qua test API trực tiếp; thay đổi hiển thị sau TTL/cache invalidation; audit đủ actor/action/target/status.

### Giai đoạn 6 — Backup, restore và vận hành (3–4 ngày)

1. Tạo folder backup và `BACKUP_FOLDER_ID` trong Script Properties.
2. Manual backup, cooldown, Backup Log và liên kết chỉ cho admin.
3. Weekly trigger, retention 12 bản, giữ file starred.
4. Restore có xác nhận `RESTORE`, kiểm tra folder/schema và pre-restore backup.
5. Chỉ restore content/package/navigation/section theo phạm vi đã duyệt; không đè user/audit/log.
6. Viết `DEPLOYMENT_RUNBOOK.md`, incident runbook và rollback checklist.

Đầu ra: quy trình backup/restore có thể diễn tập.

Tiêu chí hoàn tất: restore thành công trên bản copy staging; dữ liệu phát sinh ngoài phạm vi không bị ghi đè.

### Giai đoạn 7 — Security, QA và production (4–5 ngày)

1. Thiết lập CSP theo route, HSTS, frame deny, nosniff, referrer và permissions policy.
2. Allowlist đúng Google Fonts, YouTube, image/social và hai API staging/production.
3. Thêm test contract/API, package calculation, permission, webhook rejection và asset 404.
4. Test desktop/mobile, Chrome/Safari/Firefox, keyboard và reduced motion.
5. Kiểm tra performance; mục tiêu ban đầu LCP ≤ 2,5 s, CLS ≤ 0,1 trên mobile thực tế hợp lý.
6. Secret scan working tree/history trước release; xoay vòng ngay nếu phát hiện secret từng commit.
7. Deploy backend-first, chạy health check, deploy frontend, smoke test rồi theo dõi log 24 giờ.

Đầu ra: production release có version và rollback point.

Tiêu chí hoàn tất: không còn lỗi P0/P1; health check xanh; booking test production được đối soát và xóa/ẩn theo quy trình dữ liệu thử.

### Giai đoạn 8 — Thanh toán tự động, sau khi MVP ổn định (4–6 ngày)

1. Chốt provider và đọc tài liệu/changelog/security policy hiện hành.
2. Lưu webhook secret trong Script Properties; không đưa vào frontend.
3. Xác thực signature trên raw payload theo đúng provider.
4. Kiểm tra currency, amount, order, transaction ID và trạng thái cho phép.
5. Idempotency theo transaction ID và order state; webhook lặp trả kết quả an toàn.
6. Thử sai secret, replay, amount mismatch, order không tồn tại và webhook đến sai thứ tự.
7. Bật production sau cùng và có kill switch về manual mode.

Tiêu chí hoàn tất: webhook không thể đánh dấu `PAID` với signature/amount sai; retry không ghi hai lần.

## 8. Backlog ưu tiên

### P0 — Phải có trước khi nhận booking thật

- Git/versioning, `.gitignore`, staging tách riêng.
- Một nguồn package data và server-side price calculation.
- Booking API, validation, idempotency, order ID và email/log.
- Security headers cơ bản, secret management, health check và rollback runbook.
- Test end-to-end booking trên staging.

### P1 — Phải có trước khi bàn giao vận hành đầy đủ

- Content API, admin role/editor role, CRUD content/package/menu/section.
- Payment thủ công, payment status và thank-you.
- Audit log, backup/restore và diễn tập restore.
- Asset optimization, accessibility và browser/mobile QA.

### P2 — Sau khi vận hành ổn định

- Payment webhook tự động.
- Custom sections/rich editor nâng cao.
- UTM dashboard, conversion analytics và cảnh báo lỗi chủ động.
- Tự động hóa retention/log archival theo chính sách dữ liệu.

## 9. Ma trận kiểm thử tối thiểu

| Nhóm | Ca kiểm thử trọng yếu |
| --- | --- |
| Content | API lỗi dùng fallback; disabled/ordered section; cache invalidation |
| Package | Code không hợp lệ; gói disabled; giá/discount/extra time tính đúng |
| Form | Thiếu/sai email/sai phone/quá dài; double click; network timeout |
| Booking | Order unique; idempotency; ghi Sheet trước email; không log PII dư thừa |
| Auth | Sai password; token hết hạn; token giả; editor gọi API admin |
| XSS | HTML/script/URL nguy hiểm ở content, package và admin preview |
| Payment | Sửa URL; order không tồn tại; amount mismatch; polling timeout |
| Webhook | Sai signature; replay; cùng transaction cho hai order; out-of-order |
| Backup | Cooldown; file ngoài folder; thiếu schema; pre-restore; retention |
| UI | 360/390/768/1024/1440 px; keyboard; reduced motion; Safari iOS |
| Deploy | CSP violation; asset 404; API CORS; rollback frontend/backend |

## 10. Bảo mật và dữ liệu

- Không commit `.env`, API key, token, password, private key, Sheet ID nhạy cảm hoặc Apps Script Properties export.
- Nếu secret từng vào Git history: coi như đã lộ, thu hồi/xoay vòng trước; chỉ xử lý history theo quy trình được duyệt.
- Dữ liệu staging là synthetic; không sao chép booking thật sang môi trường thử nghiệm.
- Chỉ cấp Apps Script scopes tối thiểu; tài khoản sở hữu production bật MFA.
- Xác định retention cho booking, email/error log và quyền xóa/xuất dữ liệu khách.
- Trước khi nâng version/provider, đọc changelog và tài liệu bảo mật nhưng vẫn phải thu network evidence từ môi trường chạy nếu muốn kết luận về egress.
- Môi trường rà soát hiện tại không cung cấp proxy/firewall/network log được phê duyệt; vì vậy tài liệu này không khẳng định hệ thống hoặc agent “không upload dữ liệu”.

## 11. Ước lượng và nhân sự

Ước lượng cho một kỹ sư full-stack quen Apps Script, chưa gồm thời gian chờ duyệt nội dung/provider:

| Mốc | Thời lượng |
| --- | ---: |
| Booking MVP an toàn (giai đoạn 0–4, có thể gối đầu) | 2–3 tuần |
| CMS + backup + production hardening (giai đoạn 5–7) | 2–3 tuần |
| Payment tự động (giai đoạn 8) | 1 tuần |
| Tổng | 5–7 tuần |

Nếu có hai người, nên tách một người frontend/admin và một người Apps Script/data/ops; vẫn giữ một chủ sở hữu duy nhất cho API contract và release.

## 12. Definition of Done cho production

- Không có lỗi P0/P1 mở và mọi tiêu chí giai đoạn 0–7 đã đạt.
- Nội dung/gói chỉ có một nguồn chuẩn; fallback khớp bản release đã duyệt.
- Booking không mất khi email/payment lỗi; amount luôn được tính server-side.
- Role được bảo vệ ở API, audit không lộ secret/PII dư thừa.
- Health check, manual backup, restore staging và rollback đã được diễn tập.
- CSP/security headers không có violation ngoài dự kiến; asset không 404.
- Có release ID, changelog, deployment record, chủ sở hữu và lịch theo dõi 24 giờ.

## 13. Các quyết định cần chủ dự án xác nhận

1. Hình thức phục vụ: chỉ tại The Comma, chỉ online hay cả hai; giá có khác nhau không?
2. Booking có chọn ngày/giờ trực tiếp hay chỉ gửi nhu cầu rồi vận hành liên hệ?
3. Quy tắc giảm 10%/15%, thêm 15 phút và nước miễn phí áp dụng đồng thời thế nào?
4. Thanh toán MVP dùng ngân hàng/QR nào; provider webhook tương lai là gì?
5. Hosting/domain, email vận hành và tài khoản Google sở hữu production.
6. Retention booking/log và nội dung đồng ý xử lý dữ liệu cá nhân.
7. Bốn gói, giá, thời lượng và nội dung hiện tại có phải dữ liệu production chính thức không?
