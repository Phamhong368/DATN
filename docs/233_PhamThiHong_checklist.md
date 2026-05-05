# Checklist Tiến độ Đồ án Tốt nghiệp

Dựa trên đối chiếu giữa đề cương ĐATN và hiện trạng mã nguồn trong thư mục `/Users/phamhong/Documents/DATN`.

## Giai đoạn: Tuần 1 - 2 (Đã hoàn thành)
- [x] Khảo sát nghiệp vụ vận tải và xác định phạm vi hệ thống quản lý xe tải.
- [x] Thu thập và mô tả yêu cầu hệ thống trong tài liệu đặc tả.
- [x] Hoàn thiện tài liệu đặc tả nghiệp vụ ban đầu.

Căn cứ:
- `dacta.docx`
- `docs/bandactavathietkebosungdocx.docx`

## Giai đoạn: Tuần 3 - 4 (Đã hoàn thành)
- [x] Thiết kế cơ sở dữ liệu MySQL cho các phân hệ người dùng, xe, tài xế, khách hàng, đơn hàng, chuyến đi, tối ưu lộ trình và dữ liệu nhiên liệu.
- [x] Hoàn thiện phần thiết kế hệ thống/UML theo đề cương.
- [x] Chuẩn bị tài liệu thiết kế phục vụ triển khai các giai đoạn sau.

Căn cứ:
- `database/schema.sql`
- `docs/bandactavathietkebosungdocx.docx`
- Phần sơ đồ thiết kế theo bạn xác nhận đã đẩy lên GitHub trước đó.

## Giai đoạn: Tuần 5 - 6 (Đã hoàn thành)
- [x] Cài đặt môi trường phát triển NodeJS, ReactJS, MySQL.
- [x] Xây dựng hạ tầng backend API với Express và JWT Authentication.
- [x] Hoàn thiện API quản lý danh mục chính gồm Xe, Tài xế, Khách hàng.

Căn cứ:
- `README.md`
- `backend/src/app.js`
- `backend/src/routes/truckRoutes.js`
- `backend/src/routes/driverRoutes.js`
- `backend/src/routes/customerRoutes.js`
- `frontend/package.json`
- `backend/package.json`

## Giai đoạn: Tuần 7 - 8 (Đã hoàn thành)
- [x] Phát triển chức năng quản lý đơn hàng.
- [x] Phát triển chức năng điều xe, tạo chuyến đi, gán đơn vào chuyến.
- [x] Tích hợp bản đồ cho màn hình lộ trình và hiển thị giao diện vận hành trực quan.

Căn cứ:
- `backend/src/routes/orderRoutes.js`
- `backend/src/routes/tripRoutes.js`
- `frontend/src/App.jsx`

## Giai đoạn: Tuần 9 - 10 (Đã hoàn thành)
- [x] Xây dựng module dự báo nhiên liệu bằng mô hình hồi quy.
- [x] Xây dựng module tối ưu lộ trình giao hàng.
- [x] Tích hợp thuật toán tối ưu và hiển thị kết quả trên giao diện người dùng.

Căn cứ:
- `backend/src/routes/analyticsRoutes.js`
- `backend/src/utils/regression.js`
- `backend/src/routes/optimizerRoutes.js`
- `backend/src/utils/optimizerService.js`
- `backend/optimizer/solver.py`
- `frontend/src/App.jsx`

## Giai đoạn: Tuần 11 - 12 (Chưa hoàn thành / Cần thực hiện tiếp)
- [ ] Xây dựng bộ Unit Test chính thức cho backend/frontend.
- [ ] Xây dựng bộ Integration Test cho các luồng chính như đăng nhập, điều phối, tối ưu lộ trình, dự báo nhiên liệu.
- [x] Sửa nhiều lỗi runtime và hoàn thiện các luồng chính để hệ thống chạy được khi demo.
- [ ] Bổ sung tài liệu kiểm thử hoặc bảng test case chứng minh kết quả kiểm thử.

Căn cứ:
- Repo hiện chưa có thư mục test riêng hoặc script `npm test`.
- Frontend và backend hiện đã chạy được local, nhưng thiếu artifact kiểm thử chính thức.

## Giai đoạn: Tuần 13 (Hoàn thành một phần / Cần hoàn thiện tiếp)
- [x] Đã có tài liệu đặc tả và tài liệu thiết kế bổ sung phục vụ viết báo cáo.
- [ ] Hoàn thiện báo cáo ĐATN bản cuối cùng theo cấu trúc chuẩn nộp bảo vệ.
- [ ] Hoàn thiện slide thuyết trình bảo vệ.
- [ ] Gom đầy đủ minh chứng kỹ thuật, hình ảnh giao diện, sơ đồ và kết quả kiểm thử vào bộ tài liệu cuối.

Căn cứ:
- `dacta.docx`
- `docs/bandactavathietkebosungdocx.docx`
- `README.md`
- `docs/technical-checklist.md`

## Nhận xét tổng hợp
- Các mốc triển khai kỹ thuật chính từ tuần 5 đến tuần 10 đã bám khá sát với code hiện có.
- Phần còn thiếu chủ yếu tập trung ở kiểm thử chính thức và đóng gói tài liệu bảo vệ.
- Nếu cần nộp checklist cho giảng viên, có thể giữ nguyên cấu trúc file này và chỉ cập nhật thêm link GitHub/ảnh minh chứng cho từng giai đoạn.
