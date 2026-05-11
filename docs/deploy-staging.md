# Hướng Dẫn Cloud/Staging

Mục tiêu: đưa hệ thống TMS lên một môi trường staging có URL truy cập được để demo ngoài máy local.

## Biến môi trường cần có

Backend:

```bash
PORT=4000
DB_HOST=<mysql-host>
DB_PORT=3306
DB_USER=<mysql-user>
DB_PASSWORD=<mysql-password>
DB_NAME=tms_demo
JWT_SECRET=<strong-secret>
MAPBOX_ACCESS_TOKEN=<mapbox-token>
```

Frontend:

```bash
VITE_API_URL=https://<backend-domain>
VITE_MAPBOX_ACCESS_TOKEN=<mapbox-token>
```

## Phương án đề xuất

| Nền tảng | Dùng cho | Ghi chú |
| --- | --- | --- |
| Render/Railway/Fly.io | Backend NodeJS + Frontend static | Dễ demo, có URL public nhanh. |
| PlanetScale/Aiven/Railway MySQL | Database MySQL | Cần import `database/schema.sql` và `database/seed.sql`. |
| VPS | Full stack Docker Compose | Chủ động nhất nhưng cần cấu hình domain/SSL. |

## Quy trình deploy tối thiểu

1. Tạo MySQL staging.
2. Import `database/schema.sql`.
3. Import `database/seed.sql` nếu cần dữ liệu demo.
4. Deploy backend với biến môi trường DB/JWT/Mapbox.
5. Deploy frontend với `VITE_API_URL` trỏ về backend.
6. Kiểm tra `GET /health`.
7. Đăng nhập thử bằng tài khoản seed.
8. Chạy smoke test hoặc kiểm thử thủ công các màn chính.

## Checklist nghiệm thu staging

- [ ] URL frontend truy cập được.
- [ ] Backend `/health` trả `{ "status": "ok" }`.
- [ ] Đăng nhập Admin/Dispatcher/Driver được.
- [ ] CRUD danh mục hoạt động.
- [ ] Tối ưu VRP chạy được.
- [ ] Route map hiển thị bản đồ.
- [ ] Export Excel/PDF tải được.
- [ ] GPS tracking lưu và hiển thị vị trí.
- [ ] Không dùng `JWT_SECRET` mặc định.
