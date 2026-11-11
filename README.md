# BCA Payment Gateway — Panduan Manajemen User & Administrator via `.env`

Dokumentasi implementasi resmi arsitektur **Hybrid Env-Driven Bootstrapping + Database-Backed RBAC** untuk BCA Payment Gateway.

---

## 1. Jawaban Inti: Apakah Bisa Di-Setting di `.env`?

**Ya, sangat bisa dan sangat direkomendasikan.**

Kredensial Administrator Utama (Superadmin) serta akun operator kasir awal dapat ditentukan langsung di file `.env`. Pola ini menghilangkan kata sandi statis bawaan (*hardcoded credentials*) dari kode program, memudahkan rotasi sandi berkala di tingkat server, serta memberikan kendali kebijakan manajemen user tanpa perlu mengedit database SQLite secara manual.

---

## 2. Cara Kerja & Mekanisme Startup

```text
[Server Start (node server.js)]
   │
   ├── 1. Baca Konfigurasi .env (ADMIN_EMAIL, ADMIN_PASSWORD, USER_MANAGEMENT_MODE, dll.)
   │
   ├── 2. Cek Akun Primary Admin di Tabel `users`:
   │       ├── Belum ada  ─► Hash password (bcrypt) ─► INSERT (is_primary_admin = 1, role = 'admin')
   │       └── Sudah ada  ─► Jika ADMIN_SYNC_ON_BOOT=true ─► Perbarui email & password hash dari .env
   │
   ├── 3. Cek SEED_USERS_JSON:
   │       └── Provisioning akun kasir/operator otomatis saat server pertama kali dinyalakan.
   │
   └── 4. Kunci Kebijakan (RBAC):
           ├── mode hybrid   : Admin utama sinkron .env, kasir harian dikelola via Dashboard UI.
           ├── mode env_only : Seluruh CRUD user di Dashboard dikunci (hanya lewat .env).
           └── mode db_only  : .env hanya dipakai saat startup pertama; selanjutnya dikelola via UI.
```

---

## 3. Cara Mengatur di File `.env` (Langkah demi Langkah)

### Langkah 1: Buka atau Buat File `.env`
Di direktori proyek `/home/devcurl/workspace-webui/bca/.env`:

```bash
cp .env.example .env
nano .env
```

### Langkah 2: Tentukan Kredensial Administrator Utama
Tambahkan atau sesuaikan variabel berikut:

```dotenv
# Mode Manajemen User (hybrid | env_only | db_only)
USER_MANAGEMENT_MODE=hybrid

# Kredensial Administrator Utama (Superadmin)
ADMIN_EMAIL=owner@perusahaan-anda.com
ADMIN_PASSWORD=KataSandiKuat#2026!

# Sinkronkan email & sandi ke DB setiap kali server restart
ADMIN_SYNC_ON_BOOT=true

# Proteksi akun .env agar tidak dapat diubah/dihapus oleh admin lain via Dashboard UI
LOCK_ENV_MANAGED_USERS=true
```

### Langkah 3 (Opsional): Provisioning Operator Kasir Awal via `.env`
Jika Anda ingin menyiapkan satu atau beberapa operator kasir sekaligus saat server di-deploy:

```dotenv
SEED_USERS_JSON='[{"email":"kasir1@toko.com","password":"PasswordKasir123","role":"user"},{"email":"supervisor@toko.com","password":"PasswordSpv123","role":"admin"}]'
SEED_USERS_SYNC=false
```

### Langkah 4: Simpan dan Restart Aplikasi
```bash
npm start
# Atau jika menggunakan PM2:
pm2 restart bca-gateway
```
Saat startup, log server akan mencatat:
```text
[EnvBootstrap] Primary admin disinkronkan dari .env: ow••••@perusahaan-anda.com
[EnvBootstrap] Seed user dibuat dari .env: ka••••@toko.com (user)
```

---

## 4. Tiga Mode Kebijakan (`USER_MANAGEMENT_MODE`)

| Mode | Karakteristik | Kasus Penggunaan Ideal |
| :--- | :--- | :--- |
| **`hybrid`** *(Rekomendasi)* | Akun Superadmin disinkronkan dari `.env`, sedangkan operator kasir harian dapat ditambah, diedit, atau dinonaktifkan secara fleksibel melalui Dashboard UI (`/dashboard.html#users`). | Toko komersial, payment gateway UMKM & enterprise. |
| **`env_only`** | Endpoint `POST/PUT/DELETE /api/users` dikunci total (`403 Forbidden`). Seluruh user hanya boleh diatur melalui `.env` server. Tombol *Tambah User* disembunyikan di UI. | Infrastruktur GitOps, containerized environment (Docker/Kubernetes), atau audit ketat. |
| **`db_only`** | Kredensial `.env` hanya dibaca saat database masih kosong pertama kali (`first boot`). Perubahan selanjutnya 100% dikelola via Dashboard. | Administrator non-teknis yang ingin merotasi password mandiri dari UI. |

---

## 5. Ringkasan Variabel Environment

| Variabel | Tipe / Opsi | Default | Keterangan |
| :--- | :--- | :--- | :--- |
| `USER_MANAGEMENT_MODE` | `hybrid` \| `env_only` \| `db_only` | `hybrid` | Mode kebijakan hak akses manajemen user. |
| `ADMIN_EMAIL` | String Email | - | Alamat email Administrator Utama (Superadmin). |
| `ADMIN_PASSWORD` | String Password | - | Kata sandi Administrator Utama. |
| `ADMIN_SYNC_ON_BOOT` | `true` \| `false` | `true` | Jika `true`, reset password admin cukup dengan ganti di `.env` lalu restart. |
| `STRICT_ENV_ADMIN` | `true` \| `false` | `false` | Jika `true` di mode produksi, server menolak start jika sandi kosong/default. |
| `SEED_USERS_JSON` | String JSON Array | `[]` | Daftar user awal yang di-bootstrap otomatis. |
| `SEED_USERS_SYNC` | `true` \| `false` | `false` | Sinkronkan perubahan role/password seed user saat restart. |
| `LOCK_ENV_MANAGED_USERS` | `true` \| `false` | `true` | Cegah pengubahan/penghapusan akun bertanda `.env` dari Dashboard UI. |
| `JWT_SECRET` | String (min 32 char) | Acak | Kunci enkripsi token sesi login HMAC-SHA256. |
| `JWT_EXPIRES_HOURS` | Angka (1-8760) | `24` | Durasi masa berlaku sesi login dalam jam. |

---

## 6. Uji Coba & Verifikasi Mandiri

Jalankan perintah verifikasi sintaks dan fungsionalitas:
```bash
# Validasi sintaks seluruh file
node --check server.js
node --check database.js
node --check backend/config/env.js
node --check backend/services/adminBootstrap.js
node --check backend/middlewares/auth.js
node --check backend/middlewares/rbac.js

# Menjalankan inisialisasi / seed mandiri
node database/seed.js
```
