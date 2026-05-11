# Outline Slide Bảo Vệ Đồ Án

Đề tài: Xây dựng hệ thống quản lý, vận hành xe tải.

## 1. Trang bìa

- Tên đề tài.
- Sinh viên, mã sinh viên, giảng viên hướng dẫn.
- Công nghệ chính: ReactJS, NodeJS, MySQL, Mapbox, Google OR-Tools, Docker.

## 2. Bối cảnh và vấn đề

- Doanh nghiệp vận tải còn quản lý rời rạc bằng bảng tính.
- Điều phối, tài xế và khách hàng bị đứt gãy thông tin.
- Chi phí ẩn phát sinh do tuyến đường, nhiên liệu, bảo trì và điều xe chưa tối ưu.

## 3. Mục tiêu đồ án

- Xây dựng MIS tập trung.
- Phân quyền JWT/RBAC.
- Số hóa workflow điều phối - vận chuyển - hoàn thành - báo cáo.
- Tối ưu lộ trình VRP.
- Dự báo nhiên liệu và cảnh báo bảo trì.
- Tích hợp bản đồ và Docker.

## 4. Kiến trúc hệ thống

- Frontend ReactJS.
- Backend NodeJS/Express.
- Database MySQL.
- Mapbox API.
- OR-Tools optimizer.
- Docker/CI.

## 5. Cơ sở dữ liệu

- Bảng chính: users, roles, trucks, drivers, customers, orders, trips.
- Bảng thuật toán: route_optimizations, route_optimization_routes, route_optimization_stops.
- Bảng AI/giám sát: fuel_logs, trip_location_logs.

## 6. Phân quyền

- Admin: quản trị người dùng, xe, tài xế, khách hàng, kho.
- Dispatcher: đơn hàng, điều phối, tối ưu, bản đồ, báo cáo, tracking.
- Driver: xem chuyến được giao, cập nhật trạng thái, gửi GPS.

## 7. Workflow vận hành

- Tạo đơn hàng.
- Tạo chuyến và gán xe/tài xế.
- Gán đơn vào chuyến.
- Tài xế cập nhật trạng thái.
- Điều phối theo dõi dashboard, báo cáo và GPS.

## 8. Module tối ưu VRP

- Input: kho, xe, đơn hàng, tải trọng, time window.
- Solver: Google OR-Tools.
- Output: danh sách tuyến, thứ tự giao, tổng km, thời gian, tải sử dụng.
- Lưu lịch sử tối ưu và tạo chuyến từ kết quả.

## 9. Module bản đồ

- Tìm địa chỉ, geocode/reverse-geocode.
- Chọn điểm trực tiếp trên bản đồ.
- Tính route nhiều điểm dừng.
- Hiển thị kết quả quãng đường và thời gian.

## 10. Module AI nhiên liệu/bảo trì

- Fuel logs làm dữ liệu huấn luyện.
- Regression dự báo lít nhiên liệu.
- Metric: R2, MAE, RMSE, MAPE.
- Cảnh báo bảo trì theo km tích lũy.

## 11. Báo cáo Excel/PDF

- Xuất báo cáo đơn hàng.
- Xuất báo cáo chuyến.
- Xuất báo cáo nhiên liệu.
- Xuất báo cáo bảo trì.

## 12. GPS realtime

- Driver gửi tọa độ từ trình duyệt.
- Dispatcher xem vị trí mới nhất và lịch sử tọa độ.
- Dữ liệu lưu trong `trip_location_logs`.

## 13. Kiểm thử

- Unit test backend.
- Integration test với MySQL thật.
- Frontend component test.
- E2E browser test Playwright.
- Smoke check.
- Benchmark VRP >= 1.000 đơn.

## 14. Kết quả đạt được

- MVP bảo vệ: khoảng 88%.
- Tầm nhìn đầy đủ: khoảng 78%.
- Đã hoàn thiện luồng nghiệp vụ cốt lõi, tối ưu, AI, bản đồ, báo cáo và tracking MVP.

## 15. Hạn chế và hướng phát triển

- GPS realtime hiện ở mức browser/manual, chưa phải thiết bị IoT/mobile app thật.
- PDF export còn đơn giản, có thể nâng cấp template chuyên nghiệp.
- Cloud deploy cần tài khoản staging/production.
- Có thể bổ sung notification realtime và mobile app tài xế.
