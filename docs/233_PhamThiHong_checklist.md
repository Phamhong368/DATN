# Checklist Đối Chiếu Đề Cương Đồ Án Tốt Nghiệp

Cập nhật: `25/05/2026`

**Đề tài:** Xây dựng hệ thống quản lý, vận hành xe tải  
**Sinh viên:** Phạm Thị Hồng  
**MSSV:** 2251162017

Tài liệu này dùng để **đối chiếu trực tiếp giữa Bản tóm tắt đề cương ĐATN và hiện trạng mã nguồn** trong thư mục `/Users/phamhong/Documents/DATN`, giúp giảng viên dễ kiểm tra mức độ hoàn thành.

Quy ước:
- `[x]` Đã hoàn thành hoặc đã có trong hệ thống.
- `[ ]` Chưa hoàn thành trọn vẹn hoặc mới ở mức một phần.
- Mục nào còn cấn sẽ có ghi chú ngắn ngay bên dưới.

---

## 1. Đối Chiếu Theo Mục Tiêu Chính

### Mục tiêu 1: Kiến trúc đa người dùng theo mô hình Client-Server, bảo mật RBAC qua JWT
- [x] Hệ thống được xây dựng theo mô hình `Frontend ReactJS` và `Backend Node.js/Express`.
- [x] Đã có cơ chế đăng nhập bằng `JWT`.
- [x] Đã có phân quyền vai trò `ADMIN / DISPATCHER / DRIVER`.
- [x] Giao diện và API đã tách lớp rõ ràng theo kiến trúc client-server.

### Mục tiêu 2: Số hóa và tối ưu hóa workflow Dispatching - Tracking - Closure - Analytics
- [x] Đã có quản lý đơn hàng.
- [x] Đã có điều phối xe và tạo chuyến.
- [x] Đã có cập nhật trạng thái chuyến đi.
- [x] Đã có theo dõi hành trình thời gian thực.
- [x] Đã có dashboard và thống kê tổng quan.
- [ ] Dashboard phân tích sâu theo hiệu suất từng xe/tài xế chưa thật đầy đủ.
  - Hiện đã có dashboard tổng quan và dữ liệu phân tích nhiên liệu, nhưng KPI sâu theo từng đầu xe/tài xế vẫn còn có thể mở rộng thêm.

### Mục tiêu 3: Tối ưu hóa lộ trình bằng bài toán VRP với Google OR-Tools
- [x] Đã xây dựng module tối ưu lộ trình bằng `Google OR-Tools`.
- [x] Đã giải bài toán `VRP/VRPTW`.
- [x] Đã áp dụng ràng buộc tải trọng xe.
- [x] Đã áp dụng ràng buộc khung giờ giao hàng.
- [x] Đã lưu lịch sử tối ưu và hỗ trợ tạo chuyến từ kết quả tối ưu.

### Mục tiêu 4: Dự báo nhiên liệu bằng Regression và cảnh báo bảo trì
- [x] Đã xây dựng module dự báo nhiên liệu bằng hồi quy.
- [x] Đã có dữ liệu `fuel_logs` để huấn luyện mô hình.
- [x] Đã hiển thị chỉ số đánh giá mô hình: `R2`, `MAE`, `RMSE`, `MAPE`.
- [x] Đã có cảnh báo bảo trì theo km tích lũy.

### Mục tiêu 5: Container hóa bằng Docker, tích hợp bản đồ để giám sát và hiển thị hành trình
- [x] Đã có `Dockerfile` cho backend/frontend.
- [x] Đã có `docker-compose.yml`.
- [x] Đã tích hợp bản đồ số và hiển thị lộ trình trực quan.
- [x] Đã hỗ trợ geocode, reverse-geocode, chọn điểm trên bản đồ và tính tuyến.
- [x] Đã có luồng GPS thời gian thực qua thiết bị gửi dữ liệu vào backend.

---

## 2. Đối Chiếu Theo Nội Dung Chính Của Đề Cương

### Hệ thống vận hành dựa trên tổ hợp thuật toán tối ưu
- [x] Đã triển khai thuật toán cốt lõi cho tối ưu lộ trình nhiều điểm giao hàng.
- [x] Đã đảm bảo ràng buộc: mỗi điểm được phục vụ một lần, tải trọng xe không vượt mức cho phép, có hỗ trợ khung giờ giao hàng.
- [x] Đã tích hợp `Google OR-Tools` làm công cụ giải tối ưu.
- [ ] Phần mô tả “Shortest Path + Scheduling” trong đề cương không khớp hoàn toàn với code hiện tại.
  - Code hiện tại dùng `distance matrix`, `time matrix`, `Google Directions API` và `OR-Tools`, không có module tách riêng kiểu `Dijkstra/A*`.
- [ ] Phần mô tả “Genetic Algorithm, Tabu Search” chưa khớp với code hiện tại.
  - Hệ thống hiện dùng chiến lược tìm nghiệm ban đầu và `Guided Local Search`, chưa cài `Genetic Algorithm` hay `Tabu Search`.

---

## 3. Đối Chiếu Theo Kiến Trúc Kỹ Thuật Và Công Nghệ

### Backend API - NodeJS
- [x] Đã có backend `Node.js + Express.js`.
- [x] Đã xử lý đầy đủ logic nghiệp vụ chính.
- [x] Đã có REST API cho các module: người dùng, khách hàng, xe, tài xế, đơn hàng, chuyến xe, tối ưu lộ trình, nhiên liệu, báo cáo, tracking GPS.

### Frontend - ReactJS
- [x] Đã có frontend `ReactJS`.
- [x] Đã xây dựng dashboard tương tác.
- [x] Đã có giao diện responsive ở mức demo vận hành.

### Database - MySQL
- [x] Đã dùng `MySQL` làm cơ sở dữ liệu chính.
- [x] Đã có schema cho các bảng nghiệp vụ quan trọng: `users`, `customers`, `drivers`, `trucks`, `orders`, `trips`, `trip_orders`, `fuel_logs`, `trip_location_logs`, `gps_devices`.
- [x] Đã có dữ liệu seed và dữ liệu mẫu phục vụ demo.

### Map Engine
- [x] Đã có bản đồ trực quan trên frontend.
- [x] Đã có chọn điểm trên bản đồ, geocode, reverse-geocode, route preview.
- [x] Luồng chính hiện đã chuyển sang dùng `Google Maps + Google Directions + Google Geocoding`.
- [x] Vẫn giữ cơ chế fallback để hệ thống không chết khi dịch vụ bản đồ lỗi tạm thời.

### Optimization - Google OR-Tools
- [x] Đã có solver Python tích hợp `Google OR-Tools`.
- [x] Đã kết nối backend Node.js với solver tối ưu.

---

## 4. Đối Chiếu Theo Kết Quả Dự Kiến

### Nền tảng quản trị (TMS) hoàn chỉnh trên trình duyệt
- [x] Hệ thống chạy trên trình duyệt.
- [x] Có đăng nhập và phân quyền theo vai trò.
- [x] Tài xế có thể xem/cập nhật trạng thái chuyến trong phạm vi hệ thống.

### Dashboard điều hành thông minh
- [x] Đã có dashboard tổng quan.
- [x] Đã có thống kê số đơn, số chuyến, doanh thu dự kiến, tình trạng vận hành.
- [ ] KPI sâu theo hiệu suất từng xe/tài xế còn có thể bổ sung thêm.

### Hệ thống báo cáo tự động Excel/PDF
- [x] Đã xuất được Excel.
- [x] Đã xuất được PDF.
- [ ] Bản PDF hiện còn đơn giản về template trình bày.

### Mô hình AI ổn định cho dự báo nhiên liệu và tối ưu lộ trình
- [x] Đã có mô hình hồi quy hoạt động.
- [x] Đã có dữ liệu huấn luyện và dự báo.
- [x] Đã có tối ưu lộ trình đa điểm.

---

## 5. Đối Chiếu Theo Kế Hoạch Thực Hiện

### Tuần 1 - 2
- [x] Khảo sát nghiệp vụ vận tải.
- [x] Thu thập và xác định yêu cầu hệ thống.
- [x] Đã có tài liệu đặc tả/yêu cầu.

### Tuần 3 - 4
- [x] Thiết kế hệ thống.
- [x] Thiết kế cơ sở dữ liệu MySQL.
- [x] Hoàn thiện sơ đồ và mô hình dữ liệu ở mức phục vụ triển khai.

### Tuần 5 - 6
- [x] Cài đặt môi trường NodeJS, ReactJS, MySQL.
- [x] Xây dựng backend API nền tảng.
- [x] API quản lý danh mục đã hoạt động.

### Tuần 7 - 8
- [x] Phát triển chức năng vận hành: điều xe, tạo chuyến đi.
- [x] Tích hợp bản đồ.
- [x] Giao diện nghiệp vụ đã chạy ổn định.

### Tuần 9 - 10
- [x] Tích hợp tối ưu lộ trình.
- [x] Tích hợp dự báo nhiên liệu.
- [x] Module thông minh đã hoạt động.

### Tuần 11 - 12
- [x] Đã có Unit Test.
- [x] Đã có Integration Test.
- [x] Đã có E2E Test và smoke check.
- [x] Đã sửa nhiều lỗi và hoàn thiện luồng nghiệp vụ chính.

### Tuần 13
- [x] Đã có checklist đối chiếu đề cương.
- [x] Đã có bản tóm tắt đề cương chỉnh theo code hiện tại.
- [ ] Báo cáo cuối và slide bảo vệ vẫn cần hoàn thiện bản nộp cuối.

---

## 6. Checklist Chức Năng Đối Chiếu Nhanh

- [x] Đăng nhập JWT
- [x] Phân quyền RBAC
- [x] Quản lý người dùng
- [x] Quản lý xe
- [x] Quản lý tài xế
- [x] Quản lý khách hàng
- [x] Quản lý đơn hàng
- [x] Quản lý chuyến xe
- [x] Gán xe / tài xế / đơn hàng vào chuyến
- [x] Tracking hành trình thời gian thực
- [x] Thiết bị GPS gửi dữ liệu vào hệ thống
- [x] Bản đồ lộ trình
- [x] Tối ưu lộ trình
- [x] Lưu lịch sử tối ưu
- [x] Dự báo nhiên liệu
- [x] Cảnh báo bảo trì
- [x] Export Excel
- [x] Export PDF
- [x] Docker backend/frontend
- [x] Docker Compose
- [x] Unit test
- [x] Integration test
- [x] Frontend test / E2E test
- [x] CI GitHub Actions

---

## 7. Các Điểm Còn Cấn Khi So Với Đề Cương

- [ ] Dashboard KPI sâu theo từng xe/tài xế chưa thật đầy đủ.
- [ ] Chưa deploy public hoàn chỉnh lên cloud production.
- [ ] PDF báo cáo có thể làm đẹp hơn.
- [ ] Slide và báo cáo bản nộp cuối cần hoàn thiện thêm minh chứng.
- [ ] Mô tả thuật toán trong đề cương cần chỉnh lại cho khớp code thực tế ở phần `Shortest Path`, `Genetic Algorithm`, `Tabu Search`.
- [ ] Luồng GPS hiện đã hỗ trợ thiết bị gửi dữ liệu thật qua API, nhưng chưa khóa theo một hãng phần cứng/GPS tracker cụ thể.

---

## 8. Kết Luận

- [x] Hệ thống đã hoàn thành **phần lõi chức năng** của đồ án.
- [x] Các phân hệ chính gồm quản lý nghiệp vụ, điều phối, tối ưu lộ trình, bản đồ, GPS thời gian thực và dự báo nhiên liệu đều đã chạy được.
- [x] Kiến trúc và công nghệ thực tế nhìn chung phù hợp với định hướng đề cương.
- [ ] Phần còn lại chủ yếu là hoàn thiện hồ sơ bảo vệ và một số hạng mục nâng cấp theo hướng production.
