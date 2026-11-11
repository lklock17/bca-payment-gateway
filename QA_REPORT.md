# Laporan Audit & Verifikasi QA & Keamanan Independen
## BCA Payment Gateway — Manajemen User & Administrator Berbasis `.env` (Hybrid Env-Driven Bootstrapping + Database-Backed RBAC)

- **Profil Peninjau**: `team-qa-security` (Lead QA & Application Security Reviewer)
- **Mode Operasi**: REVIEW-ONLY (Verifikasi independen tanpa memodifikasi kode produk)
- **Target Repository**: `/home/devcurl/workspace-webui/bca`
- **Spesifikasi Rujukan**: `ARCHITECTURE_SPEC.md`, `README.md`, `.env.example`
- **Tanggal Audit**: 11 November 2026 (`2026-11-11T03:37:34Z`)
- **Status Kelulusan Akhir**: **`PASS WITH MINOR NOTES`**

---

## 1. Ringkasan Eksekutif & Uji Ketepatan Solusi

Berdasarkan audit arsitektur, inspeksi kode sumber, dan pengujian fungsional serta keamanan secara langsung terhadap server dan UI di `/home/devcurl/workspace-webui/bca`, solusi **Hybrid Env-Driven Bootstrapping + Database-Backed RBAC** dinyatakan **tepat sasaran, aman, dan berfungsi sesuai spesifikasi**.

### Verifikasi Jawaban Inti untuk Pemilik
1. **Apakah Manajemen User & Administrator bisa di-setting di `.env`?**
   **Bisa dan sudah terimplementasi penuh.** Kredensial Administrator Utama (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) serta daftar user awal (`SEED_USERS_JSON`) dibaca dari `.env` oleh `backend/config/env.js` dan disinkronkan oleh `backend/services/adminBootstrap.js` saat startup.
2. **Apakah cara kerjanya berjalan sesuai rancangan di `ARCHITECTURE_SPEC.md` & `README.md`?**
   **Ya.** Tiga mode kebijakan (`USER_MANAGEMENT_MODE`: `hybrid`, `env_only`, `db_only`), sinkronisasi saat boot (`ADMIN_SYNC_ON_BOOT`), fail-fast produksi (`STRICT_ENV_ADMIN`), proteksi akun `.env` (`LOCK_ENV_MANAGED_USERS`), pencabutan sesi (`sessions` + `POST /api/auth/logout`), serta kontrol RBAC di API dan Dashboard UI seluruhnya telah terverifikasi lewat eksekusi nyata.

---

## 2. Tabel Checklist Verifikasi Berkas & Fitur

| Komponen / Fitur | Status | Lokasi File & Baris | Bukti Hasil Verifikasi |
|---|:---:|---|---|
| Modul Parser Konfigurasi `.env` | `[x]` | `backend/config/env.js:1–149` | `node --check` exit `0`. Parsing aman untuk mode (`hybrid`/`env_only`/`db_only`), `SEED_USERS_JSON`, masking email (`maskEmail`), dan `getPublicEnvStatus()` bebas kebocoran secret. |
| Layanan Bootstrap & Sinkronisasi Admin | `[x]` | `backend/services/adminBootstrap.js:1–200` | `node --check` exit `0`. Mem-hash password dengan `bcryptjs`, menandai `is_primary_admin=1` & `managed_by_env=1`, serta mendukung upgrade database lama (`admin@gateway.com`). |
| Middleware Autentikasi & Revokasi Sesi | `[x]` | `backend/middlewares/auth.js:1–105` | `node --check` exit `0`. Verifikasi HMAC-SHA256 `crypto.timingSafeEqual`, cek `exp`, cek `users.is_active`, serta cek `sessions.revoked_at` via `jti`. |
| Middleware RBAC & Mode Lock | `[x]` | `backend/middlewares/rbac.js:1–32` | `node --check` exit `0`. `requireAdmin` memblokir role `user` (`403`); `createUserMgmtWritableMiddleware` mengunci mutasi pada mode `env_only` (`403`). |
| Skema Database Relasional & Migrasi | `[x]` | `database.js:49–199`; `database/schema.sql:1–94` | `schema.sql` valid di SQLite; tabel `roles`, `permissions`, `role_permissions`, `users`, `sessions`, `merchants`, `transactions` terbentuk; migrasi aman pada DB lama teruji (`PORT=3299`). |
| Skrip Seed Mandiri | `[x]` | `database/seed.js:1–21` | `node database/seed.js` dengan `DB_PATH` terisolasi sukses membuat Primary Admin dari `.env` (`exit 0`). |
| Endpoint Auth, Users & Env Status | `[x]` | `server.js:113–367` | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, CRUD `/api/users`, dan `GET /api/system/env-status` berjalan sesuai kontrak. |
| Antarmuka Dashboard UI Manajemen User | `[x]` | `public/dashboard.html:750–782, 1182–1207, 1527–1734` | Inline JS (`2` blok) valid; banner mode (`hybrid`/`env_only`/`db_only`), badge `Primary`/`.env`/`Aktif`/`Nonaktif`, kontrol `is_active`, serta kunci tombol di UI terverifikasi via Puppeteer tanpa error konsol. |
| Dokumentasi `.env.example` & `README.md` | `[x]` | `.env.example:1–62`; `README.md:1–128` | Lengkap memuat langkah demi langkah setting `.env`, tabel 3 mode, serta seluruh variabel konfigurasi tanpa kredensial asli. |

---

## 3. Hasil Audit Keamanan & RBAC

| Aspek Audit | Tingkat | Status | Penjelasan & Bukti |
|---|:---:|:---:|---|
| **Zero Hardcoded Secrets & Masking** | Critical | **PASS** | Kredensial utama dipindahkan ke `.env`. `GET /api/system/env-status` mengembalikan `admin_email_masked: "bo••••@bca-qa.test"` dan tidak pernah mengirim `ADMIN_PASSWORD`. `GET /api/users` dan `GET /api/auth/me` tidak mengembalikan kolom `password`. |
| **Password Hashing & Timing-Safe JWT** | Critical | **PASS** | Password di-hash menggunakan `bcryptjs` (cost configurable via `BCRYPT_ROUNDS`, default `10`). Signature JWT diverifikasi dengan `crypto.timingSafeEqual` + validasi klaim `exp` dan `jti`. |
| **RBAC & Proteksi Privilege Escalation** | High | **PASS** | Role `user` ditolak `403 Forbidden` saat mengakses `GET /api/users` maupun `POST /api/users`. Akun `is_primary_admin` tidak dapat di-downgrade ke `user` (`400`), dinonaktifkan (`400`), atau dihapus (`400`). Akun `managed_by_env` terkunci saat `LOCK_ENV_MANAGED_USERS=true` (`400`). |
| **Session Revocation & Account Status** | High | **PASS** | Penonaktifan user (`is_active=0`) langsung memblokir login baru (`403`) dan membatalkan token JWT yang sedang aktif (`401`). `POST /api/auth/logout` mencabut `token_jti` di tabel `sessions` sehingga token lama langsung ditolak `401`. |
| **Mode Enforcement (`env_only` & `STRICT_ENV_ADMIN`)** | High | **PASS** | Mode `env_only` memblokir `POST/PUT/DELETE /api/users` dengan `403 Forbidden`. Pada `NODE_ENV=production` + `STRICT_ENV_ADMIN=true` dengan sandi default `admin123`, proses boot server gagal cepat (*fail-fast*, exit code `1`). |
| **SQL Injection & XSS Protection** | High | **PASS** | Seluruh query SQLite di `server.js`, `database.js`, `adminBootstrap.js`, dan `auth.js` menggunakan *parameterized queries* (`?`). Rendering email/mode di `public/dashboard.html` memakai `escapeHtml()`. |

---

## 4. Temuan & Rekomendasi Perbaikan Konkret (Minor Notes)

Tidak ditemukan kerentanan Critical/High maupun cacat fungsional pemblokir. Terdapat **3 catatan minor (Low / Informational)** untuk penyempurnaan operasional:

1. **[Low — UX Race Condition di Tab Users]** `public/dashboard.html:1623–1626`: Pada `loadTabChunks()`, `loadEnvStatus()` dan `loadUsers()` dipanggil secara paralel tanpa `await`. Apabila `loadUsers()` selesai lebih cepat daripada `loadEnvStatus()` saat `envStatusCache` masih `null`, render tabel awal dapat sementara menampilkan tombol edit/hapus sebelum `envStatusCache` terisi. (Keamanan backend tetap aman karena endpoint mengembalikan `403 Forbidden`, namun disarankan mengubah urutan menjadi `await loadEnvStatus(); loadUsers();`).
2. **[Info — Kelengkapan File `.env` Lokal Workspace]** `/home/devcurl/workspace-webui/bca/.env`: File `.env` yang ada di direktori proyek saat ini baru mendefinisikan `PORT`, `NODE_ENV`, dan `JWT_SECRET`. Pemilik perlu menyalin blok variabel `USER_MANAGEMENT_MODE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, dan `STRICT_ENV_ADMIN` dari `.env.example` ke `.env` sebelum deployment produksi.
3. **[Info — Kombinasi `USER_MANAGEMENT_MODE=db_only` & `LOCK_ENV_MANAGED_USERS`]** `server.js:287–299`: Akun administrator utama yang dibuat saat *first boot* memiliki `managed_by_env = 1`. Jika pemilik memilih mode `db_only` dan ingin mengizinkan perubahan email/password akun admin tersebut dari UI di kemudian hari, pastikan `LOCK_ENV_MANAGED_USERS=false` di `.env`.

---

## 5. Bukti Eksekusi Pengujian Nyata (Evidence)

Seluruh pengujian dijalankan pada database terisolasi (`DB_PATH` di direktori scratch) sehingga database utama workspace tetap utuh (terverifikasi SHA-256 identik sebelum dan sesudah pengujian).

```text
=== 1. SYNTAX, INLINE JS & SCHEMA VALIDATION ===
$ for f in server.js database.js database/seed.js backend/config/env.js backend/services/adminBootstrap.js backend/middlewares/auth.js backend/middlewares/rbac.js; do node --check "$f" && echo "OK: $f"; done
OK: server.js
OK: database.js
OK: database/seed.js
OK: backend/config/env.js
OK: backend/services/adminBootstrap.js
OK: backend/middlewares/auth.js
OK: backend/middlewares/rbac.js

HTML inline JS OK: public/index.html blocks: 1
HTML inline JS OK: public/dashboard.html blocks: 2
Schema SQL OK, tables: merchants, permissions, role_permissions, roles, sessions, sqlite_sequence, transactions, users

$ DB_PATH=.../qa_seed_test.db ADMIN_EMAIL=seed@bca-qa.test ADMIN_PASSWORD=... USER_MANAGEMENT_MODE=hybrid node database/seed.js
[Seed] Menjalankan inisialisasi & sinkronisasi user (Mode: hybrid)...
[EnvBootstrap] Primary admin baru dibuat dari .env: se••••@bca-qa.test
[Seed] Selesai.

=== 2. END-TO-END FUNCTIONAL, SECURITY & PUPPETEER UI TESTS ===
- test1_hybrid (PORT=3295): PASS
  * admin_email_masked: "bo••••@bca-qa.test"
  * protections: { downgrade: 400, deactivate: 400, deletePrimary: 400, editSeedPass: 400, deleteSeed: 400 }
  * deactivation_blocks_active_jwt: 401
  * logout_revokes_jwt: 401
  * ui_hybrid: notice="Mode: hybrid...", addBtnVisible=true, primary row locked (editDisabled=true, deleteDisabled=true), consoleErrors=[], pageErrors=[]
- test2_sync_on_boot (PORT=3295, ADMIN_SYNC_ON_BOOT=true): PASS (old_login=400, new_login=200)
- test3_env_only (PORT=3296): PASS
  * api_locks: { post: 403, put: 403, delete: 403, get: 200 }
  * ui_env_only: notice="Mode: env_only...", addBtnVisible=false, allButtonsDisabled=true
- test4_db_only (PORT=3297): PASS (override_rejected=400, existing_db_admin_kept=200)
- test5_strict_env_admin (PORT=3298, NODE_ENV=production, STRICT_ENV_ADMIN=true): PASS (fail-fast exit_code=1)
- test6_legacy_upgrade (PORT=3299, legacy gateway.db): PASS (legacy_rejected=400, upgraded_login=200)

=== 3. WORKSPACE INTEGRITY CHECK ===
$ sha256sum /home/devcurl/workspace-webui/bca/gateway.db
710a84bb4db9da3d370927d607018de41bfb9eba0bba2b60e2fd2b552c41545d  gateway.db (identik sebelum & sesudah uji)
```

---

# Riwayat Audit Sebelumnya (`2026-11-11T03:15:19.212Z` — `PASS`)

## 1. Ringkasan Eksekutif (Audit Sebelumnya)
Final re-audit independen berbasis bukti nyata (*evidence-based QA*) telah dilakukan terhadap seluruh perubahan terbaru pada BCA Payment Gateway, mencakup:
1. **Rombakan Tema Compact Enterprise** (`public/css/style.css`, `public/index.html`, `public/dashboard.html`, `public/tester.html`, `public/docs.html`).
2. **Collapsible Sidebar Desktop & Off-Canvas Mobile Drawer** dengan persistensi `localStorage` (`bca_sidebar_collapsed`).
3. **Penghapusan Total Fitur Cryptocurrency / Coinbase** (penghapusan modul `utils/coinbasePersonal.js` & `utils/cryptoRates.js`, pembersihan route API, UI, dan skrip deploy).
4. **Fallback Konfigurasi BCA QRIS Terpusat melalui `.env`** (`BCA_USER`, `BCA_PASS`, `STATIC_QRIS`).
5. **Verifikasi 4 Perbaikan Edge-Case QA (`deleg_0870408a-0`)**:
   - Mobile horizontal overflow pada string ekstrem panjang tanpa spasi di seluruh tab & halaman.
   - Initial load `/dashboard.html#overview` + `hashchange`.
   - Masking `bca_user` untuk non-admin pada `GET /api/merchants`.
   - Sinkronisasi & validitas sintaks `deploy_to_server.js`.

Pengujian dijalankan secara terisolasi pada **`PORT=3290`** (mode development) dan **`PORT=3291`** (`NODE_ENV=production`) dengan backup dan restorasi penuh `gateway.db` (terverifikasi SHA-256 byte-identical: `710a84bb4db9da3d370927d607018de41bfb9eba0bba2b60e2fd2b552c41545d`). Seluruh kategori pengujian fungsional, responsivitas multi-viewport, RBAC, dan hygiene produksi dinyatakan **`PASS`**.

---

## 2. Ringkasan Status per Kategori Pengujian

| Kategori Verifikasi | Status | Bukti Ringkas Hasil Uji |
|---|:---:|---|
| **1. Tema Compact Enterprise** | **`PASS`** | Base font `13px`, background `rgb(6, 10, 20)` (`#060a14`), button `28px`, badge `11px`, KPI metric `21px`, dense table `12px`. |
| **2. Collapsible Sidebar & Persistensi** | **`PASS`** | Desktop `1280x800`: toggle `240px` &harr; `64px` (`main-content` margin `64px`), `aria-expanded="false"`, `localStorage` persisten setelah reload, kembali normal ke `240px` saat expand. |
| **3. Penghapusan Crypto / Coinbase** | **`PASS`** | `utils/coinbasePersonal.js` & `utils/cryptoRates.js` tidak ada di disk; `grep` codebase bersih dari referensi crypto/Coinbase; `POST /api/v1/charge` & `GET /api/v1/status` hanya memproses `payment_method: "qris"`. |
| **4. Fallback BCA `.env` (`BCA_USER`, `BCA_PASS`, `STATIC_QRIS`)** | **`PASS`** | `/api/system/env-status` mengonfirmasi `bca_env_ready: true` (`qa••••@bca.test`). Tambah merchant dengan kolom kredensial kosong sukses (`201`), `POST /api/v1/charge` menghasilkan Dynamic QRIS (`201`, `fee: 124`, `amount: 25124`), dan strip UI menampilkan `.ENV FALLBACK AKTIF`. |
| **5. Autentikasi, RBAC & Hygiene Produksi** | **`PASS`** | Unauthenticated & tampered JWT ditolak `401`; role `user` ditolak `403` pada `POST/PUT/DELETE /api/merchants`, `GET/POST /api/users`, `GET /api/logs`, dan `simulate-payment`. `bca_pass: null`, `static_qris: null`, `api_key` termask (`••••`), dan `bca_user` termask (`... (via .env)`) untuk non-admin. `NODE_ENV=production` (`PORT=3291`) membersihkan `DEMO_HINT_START`, `fillDemoBtn`, dan `admin123`. |
| **6. Responsivitas Mobile & Anti iOS Auto-Zoom** | **`PASS`** | Zero horizontal overflow (`scrollWidth === innerWidth`) pada `360x780`, `375x812`, `768x1024`, dan `1280x800` di `index.html`, `tester.html`, `docs.html`, dan seluruh tab `dashboard.html` (termasuk nama merchant panjang tanpa spasi & `external_id` 64-karakter). Semua input mobile terukur `16px`. Mobile drawer buka/tutup + scroll lock berfungsi normal. |
| **7. Hash Routing, XSS, Docs & Deploy Script** | **`PASS`** | Initial load `/dashboard.html#overview` aktif (`overviewActiveOnHashLoad: true`). Payload XSS `<img src=x onerror=...>` pada nama merchant tidak dieksekusi (`xssTriggered: false`). Snippet PHP `docs.html:659` valid (`has_broken_bearer: false`). `deploy_to_server.js` lolos `node --check` dan menyertakan seluruh berkas frontend/backend terbaru tanpa modul crypto terhapus. Zero console errors & page errors (`[]`). |

---

## 3. Checklist Verifikasi Berkas & Fitur Fisik

| Komponen / Fitur | Status | Lokasi File & Baris | Hasil Uji Nyata |
|---|:---:|---|---|
| Penghapusan Berkas Modul Crypto | `[x]` | `utils/coinbasePersonal.js`, `utils/cryptoRates.js` | Terkonfirmasi tidak ada di disk (`coinbasePersonal_absent: true`, `cryptoRates_absent: true`). |
| Validitas Sintaks JS & Inline HTML | `[x]` | `server.js`, `database.js`, `deploy_to_server.js`, `services/*.js`, `utils/qris.js`, `public/js/ui-core.js`, `public/*.html` | `7/7` file JS lolos `node --check`; `4/4` file HTML lolos `vm.Script`; `console_errors: []`, `page_errors: []`. |
| Dokumentasi `.env.example` | `[x]` | `.env.example:1–30` | Mendokumentasikan `PORT`, `NODE_ENV`, `JWT_SECRET`, `BCA_USER`, `BCA_PASS`, `STATIC_QRIS` tanpa kredensial asli. |
| Endpoint `/api/system/env-status` | `[x]` | `server.js:275–290` | Memerlukan JWT (`401` jika unauth), me-mask `BCA_USER` (`qa••••@bca.test`), tidak membocorkan `BCA_PASS`/`STATIC_QRIS`. |
| Fallback `.env` Merchant & Charge | `[x]` | `server.js:361–439, 548–616`; `services/bcaChecker.js:112–116` | Tambah/edit merchant dengan field kosong memakai `.env` (`201`), Charge API menghasilkan QRIS dinamis (`201`). |
| RBAC & Masking Secret (`GET /api/merchants`) | `[x]` | `server.js:75–83, 295–359` | Non-admin ditolak `403` pada endpoint admin; `bca_pass: null` untuk semua role; `api_key` & `bca_user` termask untuk non-admin; `admin-only` UI tersembunyi (`any_admin_only_visible: false`). |
| Production Demo Stripping | `[x]` | `server.js:136–145`; `public/index.html:26–44, 154–164` | Pada `NODE_ENV=production` (`PORT=3291`), `DEMO_HINT_START`, `fillDemoBtn`, dan `admin123` terhapus bersih. |
| Skala Compact Enterprise | `[x]` | `public/css/style.css`; `public/dashboard.html` | `body: 13px`, `.btn: 28px`, `.badge: 11px`, `.stat-value: 21px`, `.data-table td: 12px`. |
| Collapsible Sidebar & Persistensi | `[x]` | `public/dashboard.html:10–14, 341, 927–957`; `public/css/style.css` | `240px` &harr; `64px`, `localStorage` persisten setelah reload, kembali normal ke `240px`. |
| Mobile Drawer & Scroll Lock | `[x]` | `public/dashboard.html:301, 326, 959–975` | Hamburger membuka `.mobile-open` + backdrop + `body-scroll-locked`; klik backdrop menutup drawer & melepas scroll lock. |
| Anti iOS Auto-Zoom (`>= 16px` mobile) | `[x]` | `public/css/style.css`; `public/index.html`; `public/tester.html` | Input `#email`, `#password`, `#apiKey`, `#webhookUrl` terukur tepat `16px` pada `360x780` & `375x812`. |
| Zero Overflow Mobile (String Tanpa Spasi) | `[x]` | `public/dashboard.html:1313–1333, 1451–1454`; `public/css/style.css` | `scrollWidth === innerWidth` di `360x780`, `375x812`, `768x1024`, dan `1280x800` pada seluruh halaman & tab. |
| Initial Load `#overview` & `hashchange` | `[x]` | `public/dashboard.html:992–1018, 1935–1947` | `/dashboard.html#overview` mengaktifkan `#overviewTab` dan memuat status `.ENV FALLBACK AKTIF` + transaksi. |
| Sinkronisasi `deploy_to_server.js` | `[x]` | `deploy_to_server.js:17–28` | `node --check` exit `0`, bebas file crypto terhapus, menyertakan `public/index.html`, `public/css/style.css`, `public/js/ui-core.js`, `services/bcaChecker.js`. |

---

## 4. Hasil Audit Keamanan, RBAC & Catatan Backlog Hardening

### Kontrol Keamanan yang Terverifikasi Lulus
1. **RBAC Enforcement**: Role `user` (kasir) diblokir `403 Forbidden` pada seluruh aksi administratif (`POST /api/transactions/:id/simulate-payment`, `GET /api/logs`, `GET /api/users`, `POST /api/users`, `POST/PUT/DELETE /api/merchants`). Token yang dimodifikasi ditolak `401 Unauthorized`.
2. **Secret & Credential Masking**:
   - `bca_pass` selalu `null` dalam response `GET /api/merchants` (baik untuk admin maupun non-admin).
   - Non-admin menerima `static_qris: null`, `api_key` termask (`••••`), dan `bca_user` termask (`... (via .env)`), tanpa kebocoran `BCA_USER` mentah.
   - Database tidak menduplikasi rahasia `.env` ketika merchant dibuat dengan mode fallback.
3. **Production Hygiene & XSS**:
   - Mode `NODE_ENV=production` membersihkan blok kredensial demo dari `index.html`.
   - Seluruh rendering dinamis menggunakan `BcaUI.escapeHtml()` sehingga payload XSS `<img src=x onerror="window.__xss_triggered=true">` tidak dieksekusi (`xssTriggered: false`).

### Catatan Backlog Hardening Pra-Produksi (Non-Blocking untuk Scope UI/RBAC/Edge-Case Ini)
1. **[INFO — Secret Hygiene Skrip Utilitas]** `deploy_to_server.js:84`, `check_remote_processes.js:35`, `test_login.js:21–30`, `test_parser.js:15–16`: Skrip utilitas deployment/debug manual (tidak dieksekusi oleh runtime server web) masih menyimpan kredensial secara statis; disarankan memindahkannya ke `.env` / SSH key sebelum repositori dipublikasikan dan merotasi kredensial terkait.
2. **[INFO — Validasi Edge-Case Numeric & Snippet PHP]** `server.js:556` masih menggunakan `isNaN(baseAmt) || baseAmt <= 0` (disarankan `!Number.isFinite(baseAmt) || baseAmt <= 0` untuk menolak `"Infinity"`); `public/docs.html:659` menampilkan `"Authorization: *** " . $apiKey` yang dapat diperjelas kembali menjadi `"Authorization: Bearer " . $apiKey` pada dokumentasi eksternal.

---

## 5. Bukti Eksekusi Pengujian Nyata (Raw Test Evidence)

```text
Timestamp: 2026-11-11T03:15:19.212Z

=== 1. STATIC & SYNTAX CHECKS ===
$ for f in server.js database.js deploy_to_server.js services/bcaChecker.js services/bcaScraper.js utils/qris.js public/js/ui-core.js; do node --check "$f" && echo "OK: $f"; done
OK: server.js
OK: database.js
OK: deploy_to_server.js
OK: services/bcaChecker.js
OK: services/bcaScraper.js
OK: utils/qris.js
OK: public/js/ui-core.js

$ grep -rn -iE "coinbase|usdt|trc20|erc20|bep20|cryptoRates" server.js database.js services/ utils/ public/ deploy_to_server.js .env.example || echo "CLEAN_NO_CRYPTO_REFS"
CLEAN_NO_CRYPTO_REFS

inline_js_checks: { public/index.html: valid(1), public/dashboard.html: valid(2), public/tester.html: valid(1), public/docs.html: valid(1) }
crypto_removal: { coinbasePersonal_absent: true, cryptoRates_absent: true }
deploy_script: { has_index_html: true, has_dashboard_html: true, has_tester_html: true, has_docs_html: true, has_style_css: true, has_ui_core_js: true, has_bcaChecker: true, has_qris_util: true, references_deleted_crypto: false }

=== 2. API, .ENV FALLBACK & RBAC PROBES (PORT=3290 & PORT=3291) ===
unauthenticated: {
  /api/system/env-status: 401, /api/merchants: 401, /api/transactions: 401,
  /api/stats: 401, /api/users: 401, /api/logs: 401, /api/transactions/1/simulate-payment: 401
}
tampered_token_status: 401
admin_login: { status: 200, role: "admin", has_token: true }
create_user: { status: 201 }
kasir_login: { status: 200, role: "user", has_token: true }
env_status: { bca_env_ready: true, has_bca_user: true, has_bca_pass: true, has_static_qris: true, bca_user_masked: "qa••••@bca.test" }
create_merchant_fallback: { status: 201 }
admin_merchants_view: { found: true, bca_pass_is_null: true, is_using_env_bca: true, has_static_qris: true, api_key_unmasked: true }
kasir_merchants_view: { found: true, bca_pass_is_null: true, static_qris_is_null: true, api_key_masked: true, bca_user_masked: true, bca_user_via_env: true, leaks_raw_bca_user: false }
kasir_forbidden_tests: { post_merchant: 403, put_merchant: 403, delete_merchant: 403, get_users: 403, post_user: 403, get_logs: 403, simulate_payment: 403 }
charge_api: { status: 201, payment_method: "qris", amount: 25124, base_amount: 25000, fee: 124, has_qris_string: true, has_qris_image: true, has_crypto_fields: false }
status_api: { status: 200, tx_status: "pending", payment_method: "qris" }
admin_simulate_payment: { status: 200, message: "Simulasi pembayaran sukses berhasil dipicu" }
prod_demo_stripping (PORT=3291, NODE_ENV=production): { status: 200, has_DEMO_HINT: false, has_fillDemoBtn: false, has_admin123: false }

=== 3. PUPPETEER UI/UX, COLLAPSIBLE SIDEBAR & MULTI-VIEWPORT ===
compact_theme: { bodyFontSize: "13px", bodyBg: "rgb(6, 10, 20)", btnHeight: "28px", btnSmHeight: "28px", badgeFontSize: "11px", statValFontSize: "21px", tdFontSize: "12px", overviewActiveOnHashLoad: true, envBadgeText: ".ENV FALLBACK AKTIF" }
collapsible_sidebar: {
  collapsedState: { width: 64, marginLeft: "64px", localStorageVal: "true", ariaExpanded: "false" },
  afterReloadState: { width: 64, marginLeft: "64px" },
  expandedState: { width: 240, marginLeft: "240px", localStorageVal: "false" }
}
mobile_drawer: { openHasClass: true, openBackdrop: true, openBodyLocked: true, closeHasClass: false, closeBackdrop: false, closeBodyLocked: false }
ui_rbac_kasir: { admin_only_count: 5, any_admin_only_visible: false, all_api_keys_masked: true }
viewports (with XSS + extreme long merchant name & external_id without spaces):
- mobile_360x780:  index(360/360, inputs=16px), tester(360/360, inputs=16px), docs(360/360), dashboard_overview(360/360), dashboard_merchants(360/360), dashboard_transactions(360/360), dashboard_users(360/360) -> overflow: false, xssTriggered: false
- mobile_375x812:  index(375/375, inputs=16px), tester(375/375, inputs=16px), docs(375/375), dashboard_overview(375/375), dashboard_merchants(375/375), dashboard_transactions(375/375), dashboard_users(375/375) -> overflow: false, xssTriggered: false
- tablet_768x1024: all 7 views -> scrollWidth=768, overflow: false, xssTriggered: false
- desktop_1280x800: all 7 views -> scrollWidth=1280, overflow: false, xssTriggered: false
console_errors: []
page_errors: []

=== 4. CLEANUP & DATA PRESERVATION ===
$ sha256sum /home/devcurl/workspace-webui/bca/gateway.db
710a84bb4db9da3d370927d607018de41bfb9eba0bba2b60e2fd2b552c41545d  /home/devcurl/workspace-webui/bca/gateway.db
db_exact_restore: true
PORTS_3290_3291_FREE
```

---
*Laporan ini diperbarui secara independen dan objektif oleh `team-qa-security` berdasarkan bukti eksekusi nyata pada mode review-only.*
