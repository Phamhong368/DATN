# Checklist Đối Chiếu Yêu Cầu Đồ Án

Cập nhật: 11/05/2026.

Đề tài: **Xây dựng hệ thống quản lý, vận hành xe tải**.

Quy ước: mục nào **100%** thì không ghi chú; mục nào còn cấn mới ghi chú ngắn.

## Tổng Quan

| Hạng mục | Hoàn thiện | Ghi chú |
| --- | ---: | --- |
| MVP phục vụ bảo vệ | 92% | Còn slide, ảnh minh chứng, kịch bản demo. |
| So với toàn bộ đề cương | 84% | Còn cloud public, GPS thiết bị thật, dashboard KPI sâu, bảo mật production. |
| Hồ sơ nộp bảo vệ | 90% | Cần đóng gói báo cáo/slide cuối. |

## Checklist Chính

| STT | Yêu cầu đồ án | Hoàn thiện | Ghi chú |
| ---: | --- | ---: | --- |
| 1 | Khảo sát nghiệp vụ và xác định bài toán vận tải | 100% | |
| 2 | Thiết kế kiến trúc Client-Server | 100% | |
| 3 | Backend NodeJS/Express API | 100% | |
| 4 | Frontend ReactJS | 100% | |
| 5 | Database MySQL | 100% | |
| 6 | Đăng nhập JWT | 100% | |
| 7 | Phân quyền RBAC Admin/Dispatcher/Driver | 100% | |
| 8 | Quản lý người dùng, xe, tài xế, khách hàng, kho | 100% | |
| 9 | Quản lý đơn hàng | 100% | |
| 10 | Điều phối chuyến hàng | 100% | |
| 11 | Gán xe, tài xế, đơn hàng vào chuyến | 100% | |
| 12 | Tài xế xem và cập nhật trạng thái chuyến | 100% | |
| 13 | Workflow Dispatching - Tracking - Closure | 100% | |
| 14 | Dashboard/Analytics tổng quan | 90% | Cần thêm KPI sâu theo xe/tài xế. |
| 15 | Tối ưu lộ trình VRP bằng Google OR-Tools | 100% | |
| 16 | Ràng buộc tải trọng xe | 100% | |
| 17 | Ràng buộc khung giờ giao hàng VRPTW | 100% | |
| 18 | Lưu lịch sử tối ưu và tạo chuyến từ kết quả | 100% | |
| 19 | Benchmark VRP >= 1.000 dòng | 100% | |
| 20 | Dự báo nhiên liệu bằng Regression | 100% | |
| 21 | Đánh giá mô hình bằng R2, MAE, RMSE, MAPE | 100% | |
| 22 | Cảnh báo bảo trì theo km tích lũy | 100% | |
| 23 | Mapbox route preview | 100% | |
| 24 | Geocode, reverse-geocode, chọn điểm trên bản đồ | 100% | |
| 25 | GPS tracking mức MVP | 90% | Chưa phải thiết bị GPS thật/WebSocket. |
| 26 | Export Excel báo cáo | 100% | |
| 27 | Export PDF báo cáo | 85% | PDF còn đơn giản. |
| 28 | Dockerfile backend/frontend | 100% | |
| 29 | Docker Compose full stack | 100% | |
| 30 | Cloud/staging | 60% | Có hướng dẫn, chưa deploy public thật. |
| 31 | Unit test | 100% | |
| 32 | Integration test với MySQL thật | 100% | |
| 33 | Frontend component test | 100% | |
| 34 | E2E browser test | 100% | |
| 35 | Smoke check | 100% | |
| 36 | CI GitHub Actions | 100% | |
| 37 | Tài liệu test-case | 100% | |
| 38 | Outline slide bảo vệ | 100% | |
| 39 | Slide/báo cáo cuối | 70% | Cần dàn trang và chèn ảnh minh chứng. |
| 40 | Kịch bản demo bảo vệ | 70% | Cần viết trình tự demo ngắn. |

## Còn Cấn Chính

| STT | Việc còn cấn | Mức độ | Ghi chú |
| ---: | --- | ---: | --- |
| 1 | GPS thiết bị thật/WebSocket realtime | 60% | Hiện mới là GPS qua trình duyệt. |
| 2 | Cloud deploy public | 60% | Cần tài khoản/secret cloud. |
| 3 | Dashboard KPI sâu | 70% | Cần doanh thu, tiêu hao, hiệu suất theo từng xe/tài xế. |
| 4 | Báo cáo PDF chuyên nghiệp | 85% | Đã xuất được, cần template đẹp hơn. |
| 5 | Bảo mật production | 75% | Cần refresh token, rate limit, audit log. |
| 6 | Slide và ảnh minh chứng | 70% | Cần hoàn thiện trước bảo vệ. |
