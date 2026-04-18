# TMS Demo Monorepo

He thong quan ly van hanh xe tai phuc vu demo bao ve, gom:

- `frontend`: React SPA cho Admin, Dispatcher, Driver
- `backend`: Node.js + Express REST API + JWT
- `database`: schema va seed MySQL de import vao XAMPP

## 1. Cai dat

```bash
npm install
python3 -m pip install -r backend/optimizer/requirements.txt
```

## 2. Tao database trong XAMPP

1. Mo XAMPP va start `MySQL`
2. Tao database moi ten `tms_demo`
3. Import lan luot:
   - `database/schema.sql`
   - `database/seed.sql`

Hoac dung CLI:

```bash
/Applications/XAMPP/xamppfiles/bin/mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS tms_demo;"
/Applications/XAMPP/xamppfiles/bin/mysql -u root -p tms_demo < database/schema.sql
/Applications/XAMPP/xamppfiles/bin/mysql -u root -p tms_demo < database/seed.sql
```

## 3. Cau hinh backend

Copy `backend/.env.example` thanh `backend/.env` va cap nhat thong tin:

```env
PORT=4000
JWT_SECRET=super-secret-demo-key
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=tms_demo
DB_USER=root
DB_PASSWORD=
```

## 4. Chay ung dung

```bash
npm run dev:backend
npm run dev:frontend
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## 4.1 Chay bang Docker

Project da co san:

- `backend/Dockerfile`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `docker-compose.yml`

Chay toan bo stack:

```bash
docker compose up --build
```

Sau khi chay:

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:4000`
- MySQL container: `localhost:3307`

Thong tin MySQL trong Docker:

```env
DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=tms_demo
DB_USER=root
DB_PASSWORD=tms_root_123
```

`docker-compose` se tu dong import file `database/tms_demo_full.sql` vao MySQL container o lan khoi dong dau tien.

## 5. Bat ban do Google Maps

Tao file `frontend/.env` voi noi dung:

```env
VITE_API_URL=http://localhost:4000
VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
```

Sau khi them API key, khoi dong lai frontend de hien thi man hinh `Ban do lo trinh`.

## 6. Toi uu lo trinh VRP

He thong da co man hinh `Toi uu lo trinh` trong menu ben trai.
Backend su dung `Python + Google OR-Tools` de giai bai toan VRP/VRPTW.

Quy trinh demo:

1. Dang nhap bang tai khoan `dispatcher`
2. Mo man `Toi uu lo trinh`
3. Nhap kho xuat phat, vi du `TP.HCM` hoac `Ha Noi`
4. Chon xe va don hang can phan tuyen
5. Mac dinh he thong de `khong rang buoc gio giao`; chi bat tuy chon nay neu ban muon test VRPTW chat hon
6. Dieu chinh khung gio giao hang va thoi gian phuc vu neu can
7. Bam `Chay toi uu VRP`

Ket qua tra ve:

- So tuyen duoc tao
- Tong quang duong
- Danh sach diem giao theo thu tu toi uu tren moi xe
- ETA tung diem
- Don hang chua duoc phan tuyen neu vuot rang buoc

## Tai khoan demo

- Admin: `admin` / `password123`
- Dispatcher: `dispatcher` / `password123`
- Driver: `driver1` / `password123`
