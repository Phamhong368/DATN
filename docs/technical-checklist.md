# Checklist Ky Thuat

Cap nhat gan nhat: 11/05/2026.

Bang nay tong hop tinh trang ky thuat hien tai cua repo theo 4 cot: `Da co / Thieu / Uu tien / Cach xu ly`.

| Hang muc | Da co | Thieu | Uu tien | Cach xu ly |
| --- | --- | --- | --- | --- |
| Docker database init | Co `docker-compose.yml`, MySQL healthcheck, `schema.sql`, `seed.sql` | Truoc day thieu file `tms_demo_full.sql` theo cau hinh cu | P0 | Da sua `docker-compose.yml` de import truc tiep `schema.sql` va `seed.sql` theo thu tu khoi tao |
| Bien moi truong backend/frontend | Co `backend/.env.example` va `frontend/.env.example` | Chua co buoc setup clone-ve-chay-ngay neu nguoi dung khong doc ky | P0 | Da bo sung lenh `cp .../.env.example .../.env` trong README; can dien gia tri that khi demo |
| Huong dan khoi dong | Co README, co huong dan local va Docker | Chua noi ro cach reset stack Docker va du lieu | P0 | Da bo sung huong dan `docker compose down -v` va chay lai |
| Frontend build | Build san xuat thanh cong bang `npm run build`; CI da chay build frontend | Chua toi uu chunk lon | P0 | Giu nguyen build hien tai; neu can toi uu thi tach lazy route/manual chunks |
| Backend boot | Import duoc `backend/src/app.js`, co `/health` | Chua xac minh full stack voi DB that trong repo | P0 | Chay full local hoac Docker, test login, reports, optimizer va chup bang chung |
| Auth/session frontend | Co JWT, middleware auth va frontend bat loi 401 de dua nguoi dung ve man login | Chua co flow refresh token hoac ghi log audit dang nhap | P0 | Chap nhan cho MVP demo; neu mo rong thi them refresh token va audit log |
| Tai du lieu theo man hinh | Frontend da goi lai du lieu theo route dang truy cap, gom dashboard, danh muc, don hang, dieu phoi, trips | Chua co cache/query library chinh quy | P0 | Giu cach hien tai cho demo; neu phat trien tiep co the chuyen sang TanStack Query |
| Dau vao toi uu lo trinh | Co API `/optimizer/inputs`, frontend tu tai danh sach xe/don hang va tu chon san mot so muc dau tien | Chua co bo loc nang cao theo vung, tai trong, loai hang, ngay giao | P0 | Du cho demo; buoc tiep theo la them filter va sap xep uu tien tren UI |
| Luu vet toi uu lo trinh | Co bang `route_optimizations`, `route_optimization_orders`, `route_optimization_routes`, `route_optimization_stops`; co API history/detail/delete/materialize | Chua co man hinh so sanh nhieu lan toi uu hoac rollback chuyen da tao | P0 | Du cho demo bao ve; neu mo rong thi them compare va audit trail |
| Ban do va dinh vi dia chi | Co goi y dia chi Mapbox, Google geocode fallback Mapbox, reverse-geocode khi bam tren ban do, route preview va nhieu diem dung trung gian | Phu thuoc API key/network; chua luu toa do pickup/delivery vao DB nen van geocode lai khi tinh | P0 | Luu `pickup_lat/lng`, `delivery_lat/lng` vao bang orders/depots va cache ket qua geocode |
| Python optimizer | Co `solver.py`, `requirements.txt`, compile duoc voi `py_compile` | Phu thuoc `ortools`, chua co test input/output tu dong | P0 | Cai `backend/optimizer/requirements.txt`, sau do them 1-2 smoke test cho optimizer |
| Du lieu mau demo | Co seed cho roles, users, trucks, drivers, orders, trips, fuel logs | Chua co tai lieu mo ta tung scenario demo | P1 | Tao bang scenario: login, tao don, gan chuyen, VRP, analytics |
| Test tu dong | Co `npm test`, backend dung `node --test`, co unit/smoke test cho `optimizer`/`validators`, co API integration test voi MySQL test DB, co frontend component test bang Vitest/Testing Library, co E2E browser bang Playwright cho route map va smoke coverage cho Admin/Dispatcher/Driver; da co integration test CRUD/negative/permission cho orders, trucks, users | Chua co test sau cho tat ca form UI va cac luong hiem nhu optimizer history materialize, xoa that tren UI | P1 | Mo rong them test UI CRUD, loi validation tren frontend, materialize history va cac case loi DB/duplicate |
| Lint/format/check | Chua co | Thieu `lint`, `format`, `check` | P1 | Them ESLint/Prettier toi thieu cho frontend/backend |
| CI/CD | Co GitHub Actions `.github/workflows/ci.yml` chay `npm ci`, backend test, frontend component test, API integration test voi MySQL service, backend smoke, Playwright E2E va frontend build | Chua co deploy tu dong | P1 | Them deploy job khi co moi truong staging/production |
| Validation dau vao | Co mot phan `ensureFields` va auth middleware | Chua validate kieu du lieu, enum, range mot cach nhat quan | P1 | Them schema validation cho request body/query |
| Xu ly loi nghiep vu | Co middleware loi chung | Chua chuan hoa ma loi, thong diep, nhom loi nghiep vu | P1 | Tach domain errors va map sang HTTP status ro rang |
| Bao mat co ban | Co JWT, auth, role-based routes | Van con fallback secret mac dinh trong code, chua co rate limit/audit log | P1 | Bat buoc dung secret qua env khi production, them request logging va rate limiting |
| Kha nang mo rong frontend | Co React SPA, role-based UI, dashboard, map, analytics | Bundle lon, chua code split, chua co error boundary | P1 | Tach route lazy-load, toi uu chunk, bo sung error boundary |
| Quan ly schema du lieu | Co `schema.sql`, `seed.sql`, bootstrap bo sung cot analytics | Chua co migration strategy chinh quy | P1 | Dua cac thay doi schema vao migration scripts thay vi bootstrap runtime |
| Quan ly kho/bai | Co API va UI cho depot/kho bai, co seed va schema lien quan | Chua co phan tich nang luc kho/bai nang cao | P1 | Du cho MVP; phan nang cao dua vao dinh huong phat trien |
| Tai lieu bao ve ky thuat | Co README va 2 file `.docx` | Chua co bang map `chuc nang -> API -> man hinh -> file code` | P2 | Tao them phu luc ky thuat de de bao ve va doi chieu MVP |
| Kiem thu nghiem thu | Chua co | Thieu checklist test case va ket qua mong doi | P2 | Lap bang testcase thu cong cho tung luong chinh |
| Do phu hop bao cao vs MVP | Co nhieu noi dung nghiep vu/mo rong trong bao cao | Mot so muc trong bao cao rong hon ban code demo hien tai | P2 | Tach ro `Da lam trong MVP` va `Dinh huong phat trien` |

## P0 da xu ly trong repo

- Sua Docker init DB de khong con phu thuoc file SQL tong hop bi thieu.
- Bo sung README cho setup `.env` va reset Docker volume.
- Them bang checklist ky thuat de theo doi phan con thieu.
- Bo sung xu ly frontend khi token het han/khong hop le: hien thong bao va quay ve man dang nhap.
- Bo sung refresh du lieu theo route de thao tac danh muc, don hang, dieu phoi va trips on dinh hon khi demo.
- Bo sung cac bang luu lich su toi uu lo trinh trong `database/schema.sql` va da import vao DB local.
- Bo sung API `/optimizer/inputs` cho man hinh toi uu tu tai xe/don hang.
- Bo sung Google geocode fallback Mapbox, reverse-geocode va chon diem truc tiep tren ban do.
- Bo sung nhieu diem dung trung gian cho man hinh `Ban do lo trinh`.
- Sua normalize tieng Viet cho dia diem co chu `Đ/đ`, vi du `Đa Nang`.
- Sua UI goi y dia chi de khong che form va tu dong dong khi roi o nhap.
- Bo sung test tu dong co ban bang `node --test`: test resolve toa do tieng Viet, VRP khong vuot tai, don vuot tai bi bo lai, validate truong bat buoc.
- Bo sung smoke check backend `npm run smoke` de kiem tra `/health` khong can DB.
- Bo sung API integration test voi MySQL test DB rieng: login dispatcher, reports summary, tao order that, optimizer inputs va route preview.
- Bo sung API integration test sau hon: 401 missing token, 403 sai role, validation 400 cho order, admin tao/sua/xoa truck, admin tao/sua/xoa user va validate role sai.
- Bo sung frontend component test bang Vitest/Testing Library cho `LoginPage`.
- Bo sung Playwright E2E browser cho man hinh `Ban do lo trinh`, co mock API backend va test thao tac tinh lo trinh.
- Bo sung Playwright E2E smoke coverage cho 3 role: Admin mo cac man quan tri/danh muc, Dispatcher mo cac man nghiep vu/toi uu, Driver chi mo man chuyen duoc giao.
- Bo sung GitHub Actions CI chay install, backend test, frontend component test, API integration test voi MySQL service, backend smoke, Playwright E2E va frontend build.

## P0 con phai xac minh thu cong

- Chay `docker compose up --build`.
- Dang nhap bang tai khoan demo.
- Xac minh `Dashboard`, `Trips`, `Toi uu lo trinh`, `Lich su toi uu`, `Ban do lo trinh`, `Du bao nhien lieu`.
- Neu demo ban do/dia chi chinh xac, dien `VITE_MAPBOX_ACCESS_TOKEN`, `MAPBOX_ACCESS_TOKEN`, `VITE_GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_API_KEY` trong `.env`.
- Test thu luong: nhap dia chi cu the, chon goi y, bam ban do de lay dia chi, them diem dung, tinh lo trinh.
- Test thu luong: chon xe/don hang, chay VRP, xem lich su toi uu, tao chuyen hang tu lich su.
- Chay `npm test`, `npm run test:integration`, `npm run smoke`, `npm run test:e2e` va `npm run build` truoc khi demo/nop code.
