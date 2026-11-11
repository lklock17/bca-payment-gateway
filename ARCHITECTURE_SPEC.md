# ARCHITECTURE_SPEC.md — Analisis & Rancangan Manajemen User & Administrator via `.env` (BCA Payment Gateway)

**Proyek:** BCA Payment Gateway (`/home/devcurl/workspace-webui/bca`)  
**Mode:** Hybrid (Demo Konsumen + Arsitektur Full-Stack Produksi)  
**Peran:** Solution Architect (`team-architect`)  
**Tanggal:** 2026-11-11  

---

## 1. Jawaban & Analisis Kebutuhan: Manajemen User & Administrator via `.env`

### 1.1 Apakah Bisa Di-Setting di `.env`?
**Ya, sangat bisa dan direkomendasikan** untuk kebutuhan *bootstrapping* (inisialisasi akun Administrator utama & operator awal) serta kebijakan keamanan akses.

Namun, dalam arsitektur aplikasi web produksi, tidak semua aspek manajemen user ideal disimpan 100% di `.env`. Solusi terbaik untuk BCA Payment Gateway adalah **Hybrid Env-Driven Bootstrapping + Database-Backed RBAC**:

| Aspek | Dikelola di `.env` | Dikelola di Database (`gateway.db`) | Alasan Arsitektural |
| :--- | :---: | :---: | :--- |
| **Akun Superadmin / Admin Utama** (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) | **Ya (Wajib)** | Disinkronkan (hash) | Menghilangkan kredensial *hardcoded* (`admin@gateway.com` / `admin123`) di source code; mudah diganti per server/deployment tanpa ubah kode. |
| **Kebijakan & Mode Manajemen User** (`USER_MANAGEMENT_MODE`, `ADMIN_SYNC_ON_BOOT`) | **Ya** | — | Mengontrol apakah manajemen user UI aktif penuh, *read-only*, atau dikunci oleh konfigurasi environment. |
| **Seed User / Operator Awal** (`SEED_USERS_JSON`) | **Ya (Opsional)** | Disinkronkan saat startup | Memudahkan provisioning banyak akun kasir/operator sekaligus saat deploy container/VPS baru. |
| **CRUD User Dinamis Harian** (Tambah/Edit/Nonaktifkan Kasir, Reset Password) | Tidak | **Ya** | Perubahan kasir/staff terjadi secara *runtime* lewat Dashboard Admin tanpa perlu akses SSH ke server atau me-restart aplikasi Node.js. |
| **Session & Token Revocation** (`sessions`) | Tidak | **Ya** | Memungkinkan *force logout* dan audit login per perangkat/IP. |

---

### 1.2 Audit Kondisi Kode Eksisting (`/home/devcurl/workspace-webui/bca`)
Berdasarkan pemeriksaan file proyek saat ini (`database.js`, `server.js`, `.env.example`, `public/index.html`, `public/dashboard.html`), ditemukan celah desain berikut:
1. **Kredensial Admin Ter-hardcode (`database.js:98-106`)**:
   - Sistem menanamkan `admin@gateway.com` dengan password `admin123` secara langsung di dalam fungsi `initDb()`.
   - Jika `admin@gateway.com` sudah ada di `gateway.db`, mengubah kode atau environment tidak otomatis memperbarui password maupun email admin.
2. **Identifikasi Admin Utama Ter-hardcode (`server.js:217, 243` & `public/dashboard.html:1498, 1631`)**:
   - Proteksi penghapusan/downgrade role memeriksa `user.email === 'admin@gateway.com'`. Jika email admin diganti via `.env`, proteksi ini tidak akan berlaku kecuali diganti ke flag `is_primary_admin` atau perbandingan dinamis dengan `process.env.ADMIN_EMAIL`.
3. **`.env.example` Belum Memiliki Variabel Auth Admin**:
   - Saat ini `.env.example` baru mencakup `PORT`, `NODE_ENV`, `JWT_SECRET`, `BCA_USER`, `BCA_PASS`, dan `STATIC_QRIS`.
4. **Demo Hint di Halaman Login (`public/index.html:26-44, 154-164`)**:
   - Sudah memiliki mekanisme strip otomatis ketika `NODE_ENV=production` di `server.js:138-143`, namun teks demo masih statis mengarah ke `admin@gateway.com` / `admin123`.

---

### 1.3 Cara Kerja & 3 Pola Setting User/Admin di `.env`

#### Pola A — Env-Driven Primary Admin Bootstrap & Sync (Direkomendasikan)
Admin utama didefinisikan di file `.env`. Setiap kali aplikasi dijalankan (`initDb()`), sistem melakukan *upsert* terenkripsi (`bcrypt`) ke tabel `users`:
```env
ADMIN_EMAIL=owner@perusahaan.co.id
ADMIN_PASSWORD=SandiSuperAman#2026
ADMIN_SYNC_ON_BOOT=true
```
**Alur Kerja:**
1. Server membaca `process.env.ADMIN_EMAIL` dan `process.env.ADMIN_PASSWORD`.
2. Jika belum ada user dengan `is_primary_admin = 1`, server meng-hash `ADMIN_PASSWORD` (`bcrypt.hash(..., BCRYPT_ROUNDS)`) dan melakukan `INSERT` dengan `role = 'admin'` dan `is_primary_admin = 1`.
3. Jika sudah ada user dengan `is_primary_admin = 1` dan `ADMIN_SYNC_ON_BOOT=true`, server memperbarui email & hash password di SQLite agar selalu sinkron dengan `.env`.
4. Jika `ADMIN_PASSWORD` dikosongkan di `.env` pada `NODE_ENV=production`, server **menolak startup** (*fail-fast*) atau mencatat peringatan kritis agar tidak pernah berjalan dengan sandi default `admin123`.

#### Pola B — Provisioning Banyak User Awal via `.env` (`SEED_USERS_JSON`)
Untuk men-deploy beberapa akun administrator/operator sekaligus lewat `.env`:
```env
SEED_USERS_JSON='[{"email":"manager@toko.com","password":"PassManager!1","role":"admin"},{"email":"kasir1@toko.com","password":"PassKasir!1","role":"user"}]'
```
**Alur Kerja:**
1. Saat `initDb()` berjalan, sistem mem-parse `JSON.parse(process.env.SEED_USERS_JSON)`.
2. Untuk setiap entri, jika `email` belum terdaftar di tabel `users`, akun dibuat dengan password ter-hash `bcrypt` dan flag `managed_by_env = 1`.
3. Jika variabel `SEED_USERS_SYNC=true` aktif, perubahan password atau role di JSON akan disinkronkan saat restart.

#### Pola C — Mode Penguncian Manajemen User via `.env` (`USER_MANAGEMENT_MODE`)
Anda dapat mengendalikan perilaku tab **Manajemen User** di Dashboard melalui `.env`:
- `USER_MANAGEMENT_MODE=hybrid` *(Default)*: Akun admin utama dikelola dari `.env` (terkunci dari penghapusan/downgrade di UI), sedangkan user operator/kasir lain dapat ditambah/edit/hapus melalui Dashboard API.
- `USER_MANAGEMENT_MODE=env_only`: Semua akun didefinisikan di `.env` (`ADMIN_*` & `SEED_USERS_JSON`). Endpoint `POST/PUT/DELETE /api/users` mengembalikan `403 Forbidden` dengan pesan bahwa manajemen user dikunci ke mode `.env`.
- `USER_MANAGEMENT_MODE=db_only`: `.env` hanya digunakan saat instalasi pertama kali (`ADMIN_SYNC_ON_BOOT=false`); perubahan selanjutnya sepenuhnya lewat Dashboard UI.

---

## 2. Proposal Arsitektur untuk Klien (Ringkasan Bisnis — Mode Hybrid)

Untuk pemilik bisnis / pengelola Payment Gateway Self-Hosted:
1. **Keamanan Tingkat Enterprise**: Tidak ada lagi kata sandi bawaan pabrik (`admin123`) yang tertanam di dalam kode program. Administrator pemilik sistem cukup menentukan email & sandi master di file `.env` server yang terisolasi dari publik.
2. **Pemulihan Akses Tanpa Ribet**: Jika administrator lupa sandi, pemilik server cukup mengubah `ADMIN_PASSWORD` di `.env` dan me-restart layanan — tanpa perlu melakukan query manual ke database SQLite.
3. **Fleksibilitas Operasional Harian**: Pemilik tetap dapat menambah atau mencabut akses akun kasir/staf finance secara instan melalui Dashboard Web (`Manajemen User`), sementara akun pemilik utama tetap terlindungi agar tidak bisa dihapus atau diturunkan hak aksesnya oleh admin lain.

---

## 3. Tech Stack & Struktur Folder Multi-Layer

### 3.1 Tech Stack Eksplisit
- **Runtime & Bahasa:** Node.js v20+ (JavaScript / CommonJS, siap migrasi ESM/TypeScript).
- **Backend Framework:** Express.js `^4.19.2` + `cors` + `bcryptjs` `^2.4.3` + `crypto` bawaan Node.js (HMAC-SHA256 Token).
- **Database & Driver:** SQLite3 (`sqlite3 ^5.1.7`, file `gateway.db`), dengan DDL relasional terstruktur yang kompatibel untuk migrasi ke PostgreSQL (`pg`).
- **Frontend:** Vanilla HTML5 / CSS3 Glassmorphic UI + Vanilla JavaScript modular (`public/index.html`, `public/dashboard.html`, `public/js/ui-core.js`).
- **Integrasi Pembayaran:** KlikBCA Scraper (`puppeteer ^25.1.0`) & Dynamic EMVCo QRIS Generator (`qrcode ^1.5.3`).

### 3.2 Struktur Folder Multi-Layer (Target Modular)
Saat ini kode backend berada di root (`server.js`, `database.js`). Untuk pengembangan bersih (*Clean Architecture* bertahap tanpa merusak endpoint eksisting), arsitektur layer dirancang sebagai berikut:

```text
/home/devcurl/workspace-webui/bca/
├── .env                          # Konfigurasi rahasia server (jangan di-commit ke Git)
├── .env.example                  # Template variabel environment terdokumentasi
├── package.json
├── server.js                     # Entry point Express & bootstrap lifecycle
├── backend/
│   ├── config/
│   │   └── env.js                # Parser & validator konfigurasi .env (Admin, Auth, BCA)
│   ├── middlewares/
│   │   ├── auth.js               # requireAuth (validasi JWT + cek session/is_active)
│   │   └── rbac.js               # requireRole(['admin']), requireUserMgmtWritable()
│   ├── services/
│   │   ├── adminBootstrap.js     # Logika sinkronisasi ADMIN_* & SEED_USERS_JSON ke DB
│   │   ├── authService.js        # Verifikasi login, bcrypt compare, issue & revoke token
│   │   ├── userService.js        # CRUD user dengan proteksi is_primary_admin
│   │   ├── bcaChecker.js         # (eksisting di services/)
│   │   └── bcaScraper.js         # (eksisting di services/)
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   └── systemController.js   # /api/system/env-status
│   └── routes/
│       ├── authRoutes.js
│       ├── userRoutes.js
│       └── systemRoutes.js
├── database/
│   ├── schema.sql                # DDL relasional lengkap (users, roles, permissions, sessions, merchants, transactions)
│   ├── seed.js                   # Runner seed berbasis .env
│   └── db.js                     # Wrapper Promise SQLite (dari database.js eksisting)
└── public/                       # Frontend SPA / Multi-page UI
    ├── index.html                # Halaman Login (strip DEMO_HINT di NODE_ENV=production)
    ├── dashboard.html            # Dashboard Admin & Kasir (tab Manajemen User)
    ├── docs.html
    ├── tester.html
    ├── css/style.css
    └── js/ui-core.js
```

---

## 4. Skema Database Relasional (DDL)

Berikut rancangan DDL SQLite (kompatibel SQL standar) yang memperluas skema eksisting agar mendukung RBAC penuh, proteksi admin dari `.env`, dan audit sesi:

```sql
PRAGMA foreign_keys = ON;

-- 1. Tabel Roles (RBAC)
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,          -- 'admin', 'user' (operator/kasir), 'auditor'
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel Permissions
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,          -- e.g. 'users:manage', 'merchants:write', 'transactions:read'
  description TEXT
);

-- 3. Relasi Role - Permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 4. Tabel Users (Mendukung Env-Driven Admin & Database Users)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,             -- Selalu disimpan sebagai bcrypt hash
  role TEXT NOT NULL DEFAULT 'user',  -- Backward-compatible dengan kode eksisting
  role_id INTEGER,
  is_primary_admin INTEGER NOT NULL DEFAULT 0, -- 1 = Superadmin dari .env (anti-hapus/downgrade)
  managed_by_env INTEGER NOT NULL DEFAULT 0,   -- 1 = Di-provision/sync oleh .env
  is_active INTEGER NOT NULL DEFAULT 1,        -- 1 = Aktif, 0 = Dinonaktifkan (soft-disable)
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_primary_admin ON users(is_primary_admin);

-- 5. Tabel Sessions (Audit Login & Token Revocation)
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_jti TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_jti ON sessions(token_jti);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- 6. Tabel Merchants (Eksisting + relasi opsional creator)
CREATE TABLE IF NOT EXISTS merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  bca_user TEXT,
  bca_pass TEXT,
  static_qris TEXT,
  status TEXT DEFAULT 'active',
  api_key TEXT UNIQUE NOT NULL,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 7. Tabel Transactions (Eksisting)
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id INTEGER NOT NULL,
  external_id TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  qris_string TEXT,
  qris_image TEXT,
  webhook_url TEXT,
  bca_ref TEXT UNIQUE,
  payment_method TEXT DEFAULT 'qris',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transactions_merchant_status ON transactions(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions(external_id);
```

---

## 5. Desain Autentikasi, Sinkronisasi `.env`, & RBAC Middleware

### 5.1 Alur Bootstrapping Admin dari `.env` (`adminBootstrap.js`)
```text
[Server Start]
   │
   ▼
Baca process.env: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_SYNC_ON_BOOT, SEED_USERS_JSON
   │
   ├─► Validasi: Jika NODE_ENV === 'production' & ADMIN_PASSWORD kosong/default ('admin123')
   │      └─► Log WARNING kritis / hentikan boot jika STRICT_ENV_ADMIN=true
   │
   ├─► Cek tabel users WHERE is_primary_admin = 1 (atau email = ADMIN_EMAIL)
   │      ├─ Belum ada ─► Hash ADMIN_PASSWORD (bcrypt) -> INSERT (is_primary_admin=1, managed_by_env=1, role='admin')
   │      └─ Sudah ada & ADMIN_SYNC_ON_BOOT === 'true'
   │            └─► Update email, hash password baru, role='admin', is_active=1
   │
   └─► Jika SEED_USERS_JSON terisi
          └─► Parse JSON -> untuk tiap item {email, password, role}:
                Upsert user (jika belum ada, atau jika SEED_USERS_SYNC === 'true')
```

### 5.2 Desain JWT & Session Verification (`requireAuth`)
- **Token Payload**: `{ jti, id, email, role, is_primary_admin, iat, exp }` ditandatangani dengan HMAC-SHA256 menggunakan `JWT_SECRET` dari `.env`.
- **Masa Berlaku (`JWT_EXPIRES_HOURS`)**: Default `24` jam. Saat verifikasi di `requireAuth`:
  1. Verifikasi signature HMAC dengan `crypto.timingSafeEqual` (mencegah timing attack).
  2. Periksa `exp` belum kedaluwarsa.
  3. Periksa di database bahwa `user.is_active === 1` dan `session.revoked_at IS NULL` (sehingga admin yang dinonaktifkan atau dihapus langsung tertolak meskipun token lama masih tersimpan di browser).

### 5.3 Matriks Middleware RBAC
| Middleware | Fungsi | Perilaku |
| :--- | :--- | :--- |
| `requireAuth` | Validasi JWT & status aktif user | Mengembalikan `401 Unauthorized` jika token kosong/invalid/expired/revoked. |
| `requireRole(['admin'])` | Proteksi endpoint administratif | Mengembalikan `403 Forbidden` jika `req.user.role` tidak termasuk di daftar. |
| `requireUserMgmtWritable` | Menghormati `USER_MANAGEMENT_MODE` di `.env` | Jika `USER_MANAGEMENT_MODE=env_only`, endpoint `POST/PUT/DELETE /api/users` mengembalikan `403` dengan pesan konfigurasi dikunci via `.env`. |
| Proteksi Primary Admin & Env-Managed Users | Mencegah sabotase akun utama | User dengan `is_primary_admin === 1` tidak dapat dihapus atau diubah rolenya menjadi non-admin. Jika `USER_MANAGEMENT_MODE=hybrid` dan `managed_by_env === 1` dengan `ADMIN_LOCK_ENV_USERS=true`, perubahan password harus dilakukan melalui `.env`. |

---

## 6. Spesifikasi Lengkap `.env.example`

Berikut rancangan penambahan bagian **Manajemen User & Administrator** pada file `.env.example`:

```dotenv
# ==============================================================================
# BCA PAYMENT GATEWAY - ENVIRONMENT CONFIGURATION
# ==============================================================================

# Server Port & Mode (development | production)
PORT=3005
NODE_ENV=production

# Secret Key untuk Enkripsi JWT Session (wajib string acak >= 32 karakter di produksi)
JWT_SECRET=ganti_dengan_string_acak_panjang_minimal_32_karakter
JWT_EXPIRES_HOURS=24
BCRYPT_ROUNDS=10

# ------------------------------------------------------------------------------
# MANAJEMEN USER & ADMINISTRATOR (.env BOOTSTRAP & POLICY)
# ------------------------------------------------------------------------------
# Mode manajemen user:
# - hybrid   : Admin utama & seed user disinkronkan dari .env, user tambahan CRUD via Dashboard UI
# - env_only : Semua user hanya diatur dari .env (CRUD tambah/hapus user di UI dikunci)
# - db_only  : .env hanya dipakai saat DB kosong (initial setup), selanjutnya dikelola via UI
USER_MANAGEMENT_MODE=hybrid

# Akun Administrator Utama (Menggantikan hardcoded admin@gateway.com / admin123)
ADMIN_EMAIL=admin@perusahaan-anda.com
ADMIN_PASSWORD=GantiDenganPasswordKuat!2026

# Jika true: setiap server restart, email & password admin utama di DB disamakan dengan .env
# Berguna untuk rotasi password atau pemulihan akses admin tanpa edit database manual.
ADMIN_SYNC_ON_BOOT=true

# Opsional: Daftar user tambahan (Admin cadangan / Kasir / Operator) dalam format JSON array
# Kosongkan jika user tambahan ingin dikelola melalui menu "Manajemen User" di Dashboard.
SEED_USERS_JSON=[]
# Contoh penggunaan:
# SEED_USERS_JSON='[{"email":"manager@toko.com","password":"PasswordMgr123","role":"admin"},{"email":"kasir1@toko.com","password":"PasswordKasir123","role":"user"}]'
SEED_USERS_SYNC=false

# Proteksi akun yang berasal dari .env agar tidak dapat diedit/dihapus via Dashboard UI
LOCK_ENV_MANAGED_USERS=true

# ------------------------------------------------------------------------------
# KONFIGURASI BCA QRIS TERPUSAT (.env FALLBACK)
# ------------------------------------------------------------------------------
BCA_USER=kasir@toko-anda.com
BCA_PASS=PasswordKlikBCA123
STATIC_QRIS=00020101021126610016ID.CO.BCA.WWW...
```

---

## 7. Kontrak REST API Lengkap

### 7.1 Autentikasi (`/api/auth/*`)
| Method & Endpoint | Auth | Request Body / Header | Response `200/201` | Error Status |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/auth/login` | Publik | `{ "email": "...", "password": "..." }` | `{ "token": "...", "email": "...", "role": "admin", "is_primary_admin": true, "expires_at": "..." }` | `400` (field kosong), `401` (salah kredensial), `403` (akun nonaktif) |
| `GET /api/auth/me` | `requireAuth` | `Authorization: Bearer <token>` | `{ "id": 1, "email": "...", "role": "admin", "is_primary_admin": true, "managed_by_env": true }` | `401` |
| `POST /api/auth/logout` | `requireAuth` | `Authorization: Bearer <token>` | `{ "message": "Sesi berhasil diakhiri" }` | `401` |

### 7.2 Status Konfigurasi Environment (`/api/system/env-status`)
- **Auth:** `requireAuth`
- **Response (`200 OK`):** *(Hanya mengirim status boolean & email ter-masking, tidak pernah membocorkan password/secret)*
```json
{
  "user_management_mode": "hybrid",
  "admin_env_configured": true,
  "admin_sync_on_boot": true,
  "admin_email_masked": "ad••••@perusahaan-anda.com",
  "lock_env_managed_users": true,
  "bca_env_ready": true,
  "has_bca_user": true,
  "has_bca_pass": true,
  "has_static_qris": true,
  "bca_user_masked": "ka••••@toko-anda.com"
}
```

### 7.3 Manajemen User (`/api/users/*` — Khusus Role `admin`)
| Method & Endpoint | Middleware | Request Body | Response Sukses | Aturan Proteksi `.env` |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/users` | `requireAuth`, `requireRole(['admin'])` | — | Array `[ { id, email, role, is_primary_admin, managed_by_env, is_active, created_at } ]` | — |
| `POST /api/users` | `requireAuth`, `requireRole(['admin'])`, `requireUserMgmtWritable` | `{ "email": "...", "password": "...", "role": "user" \| "admin" }` | `201 Created`: `{ "message": "User berhasil dibuat", "id": 2 }` | Ditolak `403` jika `USER_MANAGEMENT_MODE=env_only`. |
| `PUT /api/users/:id` | `requireAuth`, `requireRole(['admin'])`, `requireUserMgmtWritable` | `{ "email": "...", "password?": "...", "role": "...", "is_active?": true }` | `200 OK`: `{ "message": "User berhasil diperbarui" }` | `400/403` jika mencoba menurunkan role `is_primary_admin`, atau mengedit akun `managed_by_env` saat `LOCK_ENV_MANAGED_USERS=true`. |
| `DELETE /api/users/:id` | `requireAuth`, `requireRole(['admin'])`, `requireUserMgmtWritable` | — | `200 OK`: `{ "message": "User berhasil dihapus" }` | `400/403` jika `is_primary_admin === 1`, atau jika menghapus diri sendiri (`id === req.user.id`). |

### 7.4 Modul Bisnis Eksisting (Tetap Dipertahankan)
- **Merchants:** `GET/POST/PUT/DELETE /api/merchants` (Proteksi secret `bca_pass` & `static_qris` untuk role non-admin tetap dipertahankan).
- **Transactions & Stats:** `GET /api/transactions`, `GET /api/stats`, `POST /api/transactions/:id/simulate-payment` (`admin` only).
- **Public Store API:** `POST /api/v1/charge`, `GET /api/v1/status/:external_id` (Auth via Merchant `api_key`).

---

## 8. Panduan Ringkas Pemilik & Handoff Implementasi

### Cara Pemilik Mengatur Admin & User di `.env` (Setelah Diimplementasikan)
1. Buka/buat file `.env` di direktori proyek `/home/devcurl/workspace-webui/bca/.env` (salin dari `.env.example`).
2. Isi kredensial Administrator utama:
   ```env
   USER_MANAGEMENT_MODE=hybrid
   ADMIN_EMAIL=admin@domainanda.com
   ADMIN_PASSWORD=PasswordKuatAnda2026!
   ADMIN_SYNC_ON_BOOT=true
   ```
3. *(Opsional)* Jika ingin sekalian membuat akun kasir/operator dari `.env`, tambahkan:
   ```env
   SEED_USERS_JSON='[{"email":"kasir1@domainanda.com","password":"KasirPass123!","role":"user"}]'
   ```
4. Restart server (`npm start` atau restart systemd/PM2 service). Server otomatis menanam/menyinkronkan hash password ke `gateway.db` saat startup.

### Rencana Handoff Teknis (Jika Pemilik Memilih untuk Menerapkan Perubahan Kode)
1. **`team-engineer`**:
   - Tambah modul `backend/config/env.js` dan `backend/services/adminBootstrap.js` (memvalidasi `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SEED_USERS_JSON`, serta `USER_MANAGEMENT_MODE`).
   - Perbarui `database.js` untuk menambahkan kolom `is_primary_admin`, `managed_by_env`, `is_active`, serta tabel `sessions`.
   - Perbarui `server.js` (ganti pengecekan hardcoded `'admin@gateway.com'` dengan `is_primary_admin === 1`, tambah `exp`/`jti` di token, terapkan `USER_MANAGEMENT_MODE`, dan perluas `/api/system/env-status`).
   - Perbarui `public/dashboard.html` (tampilkan badge `Env Managed` pada user dari `.env`, sembunyikan tombol tambah/edit/hapus user jika `user_management_mode === 'env_only'`, dan cek `u.is_primary_admin` alih-alih email statis).
   - Perbarui `.env.example`.
2. **`team-qa-security`**:
   - Uji bootstrap admin baru dari `.env`, rotasi password via `ADMIN_SYNC_ON_BOOT=true`, mode `env_only` vs `hybrid`, serta validasi bahwa secret `.env` tidak pernah bocor di respons API maupun UI produksi (`NODE_ENV=production`).
