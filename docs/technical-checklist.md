# Checklist Ky Thuat

Bang nay tong hop tinh trang ky thuat hien tai cua repo theo 4 cot: `Da co / Thieu / Uu tien / Cach xu ly`.

| Hang muc | Da co | Thieu | Uu tien | Cach xu ly |
| --- | --- | --- | --- | --- |
| Docker database init | Co `docker-compose.yml`, MySQL healthcheck, `schema.sql`, `seed.sql` | Truoc day thieu file `tms_demo_full.sql` theo cau hinh cu | P0 | Da sua `docker-compose.yml` de import truc tiep `schema.sql` va `seed.sql` theo thu tu khoi tao |
| Bien moi truong backend/frontend | Co `backend/.env.example` va `frontend/.env.example` | Chua co buoc setup clone-ve-chay-ngay neu nguoi dung khong doc ky | P0 | Da bo sung lenh `cp .../.env.example .../.env` trong README; can dien gia tri that khi demo |
| Huong dan khoi dong | Co README, co huong dan local va Docker | Chua noi ro cach reset stack Docker va du lieu | P0 | Da bo sung huong dan `docker compose down -v` va chay lai |
| Frontend build | Build san xuat thanh cong bang `npm run build` | Chua co tu dong kiem tra trong CI | P0 | Giu nguyen build hien tai, buoc tiep theo la them smoke check/CI |
| Backend boot | Import duoc `backend/src/app.js`, co `/health` | Chua xac minh full stack voi DB that trong repo | P0 | Chay full local hoac Docker, test login, reports, optimizer va chup bang chung |
| Python optimizer | Co `solver.py`, `requirements.txt`, compile duoc voi `py_compile` | Phu thuoc `ortools`, chua co test input/output tu dong | P0 | Cai `backend/optimizer/requirements.txt`, sau do them 1-2 smoke test cho optimizer |
| Du lieu mau demo | Co seed cho roles, users, trucks, drivers, orders, trips, fuel logs | Chua co tai lieu mo ta tung scenario demo | P1 | Tao bang scenario: login, tao don, gan chuyen, VRP, analytics |
| Test tu dong | Chua co | Thieu `test` scripts cho root/backend/frontend | P1 | Them `npm run test`, bat dau bang smoke tests backend |
| Lint/format/check | Chua co | Thieu `lint`, `format`, `check` | P1 | Them ESLint/Prettier toi thieu cho frontend/backend |
| CI/CD | Chua co | Thieu workflow build/test | P1 | Them GitHub Actions: install, build frontend, smoke test backend |
| Validation dau vao | Co mot phan `ensureFields` va auth middleware | Chua validate kieu du lieu, enum, range mot cach nhat quan | P1 | Them schema validation cho request body/query |
| Xu ly loi nghiep vu | Co middleware loi chung | Chua chuan hoa ma loi, thong diep, nhom loi nghiep vu | P1 | Tach domain errors va map sang HTTP status ro rang |
| Bao mat co ban | Co JWT, auth, role-based routes | Van con fallback secret mac dinh trong code, chua co rate limit/audit log | P1 | Bat buoc dung secret qua env khi production, them request logging va rate limiting |
| Kha nang mo rong frontend | Co React SPA, role-based UI, dashboard, map, analytics | Bundle lon, chua code split, chua co error boundary | P1 | Tach route lazy-load, toi uu chunk, bo sung error boundary |
| Quan ly schema du lieu | Co `schema.sql`, `seed.sql`, bootstrap bo sung cot analytics | Chua co migration strategy chinh quy | P1 | Dua cac thay doi schema vao migration scripts thay vi bootstrap runtime |
| Tai lieu bao ve ky thuat | Co README va 2 file `.docx` | Chua co bang map `chuc nang -> API -> man hinh -> file code` | P2 | Tao them phu luc ky thuat de de bao ve va doi chieu MVP |
| Kiem thu nghiem thu | Chua co | Thieu checklist test case va ket qua mong doi | P2 | Lap bang testcase thu cong cho tung luong chinh |
| Do phu hop bao cao vs MVP | Co nhieu noi dung nghiep vu/mo rong trong bao cao | Mot so muc trong bao cao rong hon ban code demo hien tai | P2 | Tach ro `Da lam trong MVP` va `Dinh huong phat trien` |

## P0 da xu ly trong repo

- Sua Docker init DB de khong con phu thuoc file SQL tong hop bi thieu.
- Bo sung README cho setup `.env` va reset Docker volume.
- Them bang checklist ky thuat de theo doi phan con thieu.

## P0 con phai xac minh thu cong

- Chay `docker compose up --build`.
- Dang nhap bang tai khoan demo.
- Xac minh `Dashboard`, `Trips`, `Toi uu lo trinh`, `Du bao nhien lieu`.
- Neu can demo ban do, dien `VITE_GOOGLE_MAPS_API_KEY` trong `frontend/.env`.
