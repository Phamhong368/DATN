# Test Cases Hệ Thống TMS

Cập nhật: 11/05/2026.

## Tổng quan

| Nhóm test | Phạm vi | Loại test | Trạng thái |
| --- | --- | --- | --- |
| Auth/JWT | Đăng nhập, token sai/hết hạn | Integration, E2E | Pass |
| RBAC | Admin, Dispatcher, Driver | Integration, E2E | Pass |
| CRUD danh mục | User, truck, driver, customer, depot | Integration | Pass một phần trọng yếu |
| Orders | Tạo đơn, validate dữ liệu, trạng thái | Integration | Pass |
| Trips/Dispatch | Tạo chuyến, gán đơn, cập nhật trạng thái | Integration, E2E | Pass |
| VRP/OR-Tools | Tải trọng, time window, đơn không phân tuyến | Unit, Integration, E2E | Pass |
| Route Map | Nhập địa chỉ, geocode, tính tuyến | E2E | Pass |
| Fuel Regression | Train, predict, MAE/RMSE/MAPE | Unit/API manual | Cần mở rộng automated test |
| Reports | Export Excel/PDF | API manual | Mới bổ sung |
| GPS Tracking | Gửi tọa độ, xem vị trí mới nhất/lịch sử | API/UI manual | Mới bổ sung |

## Test Case Chi Tiết

| ID | Module | Kịch bản | Dữ liệu vào | Kết quả mong đợi | Loại |
| --- | --- | --- | --- | --- | --- |
| TC-AUTH-01 | Auth | Đăng nhập đúng tài khoản | `admin/password` | Trả token JWT và role ADMIN | Integration |
| TC-AUTH-02 | Auth | Đăng nhập sai mật khẩu | Sai password | HTTP 401, không trả token | Integration |
| TC-RBAC-01 | RBAC | Driver truy cập API admin | Token DRIVER gọi `/users` | HTTP 403 | Integration |
| TC-RBAC-02 | RBAC | Dispatcher truy cập màn tối ưu | Token DISPATCHER | Mở được `/optimizer` | E2E |
| TC-CRUD-01 | Trucks | Admin tạo xe hợp lệ | Biển số, tải trọng, trạng thái | Xe được lưu vào MySQL | Integration |
| TC-CRUD-02 | Trucks | Dispatcher tạo xe | Token DISPATCHER | HTTP 403 | Integration |
| TC-ORD-01 | Orders | Tạo đơn hàng hợp lệ | Khách hàng, điểm lấy/giao, tải trọng | Đơn ở trạng thái `PENDING_DISPATCH` | Integration |
| TC-ORD-02 | Orders | Thiếu trường bắt buộc | Không có `customer_id` | HTTP 400 | Integration |
| TC-TRIP-01 | Trips | Tạo chuyến mới | Xe, tài xế, điểm đi/đến | Chuyến được tạo, có status log | Integration |
| TC-TRIP-02 | Trips | Gán đơn vào chuyến | `tripId`, `orderIds` | Đơn chuyển sang `ASSIGNED` | Integration |
| TC-TRIP-03 | Driver | Tài xế bắt đầu chuyến | Token DRIVER, status `IN_TRANSIT` | Chuyến và đơn chuyển trạng thái | E2E |
| TC-VRP-01 | VRP | Tối ưu nhiều đơn/xe | Xe + đơn hợp lệ | Trả route, tổng km, tải sử dụng | Unit/Integration |
| TC-VRP-02 | VRP | Đơn quá tải | Đơn nặng hơn mọi xe | Đơn nằm trong `unassignedOrders` | Unit |
| TC-VRP-03 | VRP Benchmark | Dataset >= 1.000 đơn | `npm run benchmark:vrp` | Có duration, assignment rate, total distance | Manual/Benchmark |
| TC-MAP-01 | Route Map | Nhập địa chỉ chính xác | Nam Từ Liêm -> Hạ Long | Gợi ý địa chỉ và route preview | E2E |
| TC-FUEL-01 | Fuel | Train regression | >= 5 fuel logs | Có coefficients, R2, MAE, RMSE, MAPE | API |
| TC-FUEL-02 | Fuel | Predict fuel | Km, tải, idle, speed | Trả số lít và L/100km | API |
| TC-REPORT-01 | Reports | Export Excel đơn hàng | `/reports/export?report=orders&format=xlsx` | Tải file `.xls` mở được bằng Excel | API/UI |
| TC-REPORT-02 | Reports | Export PDF chuyến | `/reports/export?report=trips&format=pdf` | Tải file `.pdf` | API/UI |
| TC-GPS-01 | GPS | Driver gửi vị trí | Latitude/longitude | Lưu vào `trip_location_logs` | API/UI |
| TC-GPS-02 | GPS | Dispatcher xem latest | `/tracking/latest` | Trả vị trí mới nhất từng chuyến | API/UI |

## Lệnh Kiểm Thử

```bash
npm test
npm run test:integration
npm run smoke
npm run test:e2e
npm run benchmark:vrp
```

## Minh Chứng Nên Đưa Vào Báo Cáo

- Ảnh màn hình CI hoặc terminal chạy test pass.
- Ảnh màn hình export Excel/PDF.
- Ảnh màn hình GPS realtime có latest location.
- Kết quả benchmark VRP 1.000 dòng.
- Bảng metric regression gồm R2, MAE, RMSE, MAPE.
