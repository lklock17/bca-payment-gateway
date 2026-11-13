# 🛡️ Security & Vulnerability Audit Report
- **Tanggal Audit**: 2026-11-12
- **Target Proyek**: `bca-payment-gateway` (`/home/devcurl/workspace-webui/bca`)
- **Auditor**: `@team-qa-security` (Lead QA & Application Security Reviewer)
- **Status Akhir**: `PASS (REMEDIATED & VERIFIED)`

---

## 1. Ringkasan Eksekutif
Audit keamanan menyeluruh dan remediasi telah dijalankan pada proyek **BCA Payment Gateway**, mencakup audit dependensi (`npm audit` + live OSV.dev CVE database), otentikasi & manajemen sesi, sanitasi query SQLite, otorisasi RBAC, validasi API publik `/api/v1/charge`, proteksi SSRF webhook, serta kebersihan skrip dan file statis.

- **Total Dependensi Dipindai**: 243 paket (8 direct dependencies di `package.json`, 191 paket setelah `npm audit fix` & pembaruan `sqlite3@^6.0.1`)
- **Temuan Awal**:
  - **Critical**: 2 temuan kode (Hardcoded SSH & KlikBCA credentials pada skrip helper) + 2 CVE dependensi (`proxy-addr`, `tar`)
  - **High**: 5 temuan kode (Missing login brute-force rate limiting, JWT `exp`/`jti` & session revocation bypass, SSRF & missing timeout pada webhook, eksposur screenshot KlikBCA di folder `public/`, bypass proteksi penonaktifan Primary Admin via nilai falsy) + 11 CVE dependensi
  - **Medium**: 3 temuan kode (Validasi `external_id`/`amount` `parseFloat` pada `/api/v1/charge`, `NaN` pada `LIMIT ?` di `/api/transactions`, header sensitif tersimpan di `/api/test-webhook` + missing HTTP security headers + CORS/body size limit & validasi input user) + 1 CVE dependensi
  - **Low**: 2 temuan kode (Potensi HTML injection pada tag `59` di generator gambar QRIS Puppeteer, `X-Powered-By` header aktif) + 2 CVE dependensi
- **Status Setelah Remediasi**: Seluruh celah Critical, High, Medium, dan Low pada kode aplikasi telah diperbaiki dan diverifikasi dengan suite pengujian otomatis (`0 vulnerabilities` pada `npm audit`).

---

## 2. Hasil Audit Dependensi (`npm audit` & Live OSV.dev)

### 2.1 Pemindaian Live OSV.dev (`package.json`)
- Perintah: `python3 .../osv_scanner.py /home/devcurl/workspace-webui/bca/package.json`
- Hasil: `0` CVE langsung pada versi semver direct dependencies saat query awal; pemindaian transitive lockfile dilakukan melalui `npm audit`.

### 2.2 Temuan & Patch `npm audit`
Sebelum perbaikan (`npm audit --json`): **16 vulnerabilities** (2 Critical, 11 High, 1 Moderate, 2 Low).
Setelah eksekusi `npm audit fix --ignore-scripts`, pembaruan `sqlite3@^6.0.1`, dan `npm rebuild sqlite3`: **`found 0 vulnerabilities`**.

| Paket | Severity Awal | Ringkasan Celah (CVE / GHSA) | Status & Tindakan |
|---|---|---|---|
| `proxy-addr` (`1.1.0 - 2.0.7`) | **CRITICAL** | IP spoofing via IPv4-mapped IPv6 trust subnet (`GHSA-jqcg-44mw-7w3h`) | **FIXED** (`2.0.8` via `npm audit fix`) |
| `tar` / `node-gyp` / `cacache` / `@tootallnate/once` (via `sqlite3@5.1.7`) | **CRITICAL / HIGH / LOW** | Path traversal & DoS pada `node-tar` (`GHSA-34x7-hfp2-rc4v`, `GHSA-23hp-3jrh-7fpw`, dll.) | **FIXED** (`sqlite3@^6.0.1` + `npm rebuild sqlite3`, `0 vulnerabilities`) |
| `body-parser` (`<=1.20.8`) | **HIGH** | Denial of Service via trailing bytes & invalid limit (`GHSA-27r3-jxmh-p828`, `GHSA-v422-hmwv-36x6`) | **FIXED** (`1.20.9` via `npm audit fix`) |
| `brace-expansion` (`<=1.1.20`) | **HIGH** | DoS via exponential expansion & stack exhaustion (`GHSA-3jxr-9vmj-r5cp`, `GHSA-mh99-v99m-4gvg`, dll.) | **FIXED** (`1.1.22` via `npm audit fix`) |
| `ip-address` (`<=10.7.3`) | **HIGH** | Octal/CIDR/NAT64 misclassification & SSRF bypass (`GHSA-mwp4-54f8-5fhr`, dll.) | **FIXED** (`10.7.6` via `npm audit fix`) |
| `zod` / `chromium-bidi` / `puppeteer` | **HIGH** | Memory exhaustion DoS (`GHSA-mrhx-c7xc-m3w5`) | **FIXED** (`puppeteer@25.17.0`) |
| `qs` (`<=6.16.0`) | **MODERATE** | DoS via controlled `isBuffer` / `arrayFormat` (`GHSA-4mjr-xmp4-gh2g`, `GHSA-6pq8-jhm2-2vcw`) | **FIXED** (diperbarui via `npm audit fix`) |

---

## 3. Hasil Audit SAST & OWASP Top 10

- [x] **Hardcoded Secrets Hygiene**: **BERSIH (REMEDIATED)** — Seluruh kredensial SSH & KlikBCA pada skrip helper dipindahkan ke `.env`; `.env` dan `gateway.db` terlindungi di `.gitignore`.
- [x] **Parameterized SQL Queries**: **AMAN** — Seluruh query di `database.js`, `server.js`, `services/bcaChecker.js`, `backend/middlewares/auth.js`, dan `backend/services/adminBootstrap.js` menggunakan placeholder `?` tanpa string concatenation.
- [x] **Authentication & Session Security**: **TERVERIFIKASI (REMEDIATED)** — Rate limiter brute-force aktif pada `/api/auth/login`, verifikasi signature HMAC-SHA256 menggunakan `crypto.timingSafeEqual`, validasi `exp` & `jti` wajib, dan sesi langsung dicabut saat logout, penonaktifan user, maupun perubahan password.
- [x] **RBAC & Sensitive Data Protection**: **TERVERIFIKASI (REMEDIATED)** — Endpoint admin (`/api/users`, `/api/logs`, `/api/transactions/:id/simulate-payment`, `/api/merchants/:id/sync-qris`) dikunci `requireAdmin`; `bca_pass` dan `static_qris` tidak bocor ke non-admin; Primary Admin terlindungi dari penghapusan, downgrade, maupun penonaktifan.
- [x] **Public API & SSRF Guard**: **TERVERIFIKASI (REMEDIATED)** — `/api/v1/charge` memvalidasi `external_id`, `Number(amount)` positif/finite, Bearer API key `BCA-GW-...`, serta menolak URL webhook non-HTTP(S) dan IP privat/metadata (dengan pengecualian aman `/api/test-webhook` untuk tester UI).

---

## 4. Daftar Temuan Keamanan & Remediasi yang Diterapkan

### [CRITICAL] C-01: Hardcoded Kredensial SSH Root & Akun KlikBCA pada Skrip Helper
- **Lokasi**: `check_remote_processes.js`, `deploy_to_server.js`, `test_login.js`, `test_parser.js`
- **Deskripsi**: Ditemukan alamat IP VPS, username `root`, password SSH plaintext, serta email dan password KlikBCA Merchant tertanam langsung di dalam kode sumber skrip helper.
- **Remediasi**: Keempat file direfaktor untuk memuat konfigurasi melalui `loadDotEnv()` (`SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PASSWORD`, `BCA_USER`, `BCA_PASS`) dan langsung keluar (`process.exit(1)`) jika environment variable belum diset.

### [HIGH] H-01: Tidak Ada Proteksi Brute-Force / Rate Limiting pada `/api/auth/login`
- **Lokasi**: `server.js` (`POST /api/auth/login`)
- **Deskripsi**: Endpoint login tidak memiliki pembatasan percobaan gagal, memungkinkan serangan *password guessing* dan *credential stuffing* tanpa batas.
- **Remediasi**: Ditambahkan middleware `createRateLimiter` pada `backend/utils/security.js` dan diterapkan ke `POST /api/auth/login` (maksimal 10 percobaan per 15 menit per kombinasi IP + email, mengembalikan HTTP `429` dengan header `Retry-After`, dan direset saat login sukses) serta `POST /api/v1/charge` (120 req/menit per IP).

### [HIGH] H-02: Validasi `exp`/`jti` JWT Longgar & Sesi Aktif Tidak Dicabut Saat User Dinonaktifkan/Ganti Password
- **Lokasi**: `backend/middlewares/auth.js`, `server.js` (`PUT /api/users/:id`)
- **Deskripsi**:
  1. `if (payload.exp && ...)` dapat melewati pemeriksaan kedaluwarsa jika field `exp` dihilangkan atau bukan angka.
  2. Pemeriksaan `sessions` hanya menolak jika `session` ada dan memiliki `revoked_at`, sehingga token tanpa `jti` atau tanpa baris `sessions` masih diterima.
  3. Saat admin menonaktifkan user (`is_active = 0`) atau mengganti password di `PUT /api/users/:id`, sesi lama di tabel `sessions` tidak otomatis dicabut.
- **Remediasi**:
  1. Mewajibkan `typeof payload.exp === 'number'`, `Number.isFinite(payload.exp)`, dan `typeof payload.jti === 'string'`.
  2. Mewajibkan baris sesi ditemukan di tabel `sessions` dan `revoked_at` bernilai `NULL`.
  3. Menjalankan `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL` saat `nextActive === 0` atau password diubah.

### [HIGH] H-03: Risiko SSRF & Tidak Adanya Timeout pada Webhook Dispatcher
- **Lokasi**: `server.js` (`POST /api/v1/charge`), `services/bcaChecker.js` (`dispatchWebhook`)
- **Deskripsi**: `webhook_url` tidak divalidasi protokol maupun target IP-nya (berisiko SSRF ke jaringan internal/metadata cloud), `fetch()` tidak memiliki timeout sehingga dapat menggantung worker, serta mengizinkan redirect otomatis.
- **Remediasi**:
  1. Menambahkan `validateWebhookUrl()` di `backend/utils/security.js` yang hanya mengizinkan protokol `http:`/`https:`, menolak embedded credentials, dan memblokir IP loopback/privat/link-local/cloud metadata (dengan pengecualian terkontrol untuk `/api/test-webhook` pada tester lokal).
  2. Menambahkan `redirect: 'manual'` dan `signal: AbortSignal.timeout(10000)` pada `fetch()` di `dispatchWebhook()`, serta menghitung signature HMAC-SHA256 nyata pada header `X-Payment-Signature`.

### [HIGH] H-04: Kebocoran Screenshot Portal KlikBCA ke Direktori Publik (`public/`)
- **Lokasi**: `services/bcaScraper.js` (baris 117 & 265), `public/screenshot-1-login.png`, `public/screenshot-3-final.png`
- **Deskripsi**: Scraper menyimpan screenshot halaman login dan mutasi KlikBCA ke folder `public/` yang disajikan bebas oleh `express.static('public')`.
- **Remediasi**: Penyimpanan screenshot dinonaktifkan secara default (hanya aktif ke folder non-publik `logs/` jika `DEBUG_SCREENSHOTS=true`), dan kedua file `.png` yang terlanjur berada di `public/` telah dihapus.

### [HIGH] H-05: Bypass Proteksi Penonaktifan Primary Admin via Nilai Falsy (`null` / `""`)
- **Lokasi**: `server.js` (`PUT /api/users/:id`)
- **Deskripsi**: Pengecekan awal hanya memeriksa `is_active === 0 || is_active === false`, sedangkan penetapan nilai menggunakan `is_active ? 1 : 0`. Input `""` atau `null` dapat lolos dari pengecekan namun menonaktifkan Primary Admin.
- **Remediasi**: Menormalisasi `nextActive` terlebih dahulu sebelum melakukan pengecekan `if (user.is_primary_admin === 1 && nextActive === 0)`.

### [MEDIUM] M-01: Validasi Input Longgar pada `/api/v1/charge`, `/api/transactions`, & `/api/users`
- **Lokasi**: `server.js`
- **Deskripsi**:
  1. `parseFloat(amount)` pada `/api/v1/charge` menerima string parsial seperti `"1000abc"` dan `external_id` tidak dibatasi tipe/panjangnya.
  2. Parameter `limit` pada `GET /api/transactions` menggunakan `parseInt(limit, 10)` tanpa validasi `Number.isFinite` sehingga input non-numerik menghasilkan `NaN`.
  3. `/api/auth/login`, `POST /api/users`, dan `PUT /api/users/:id` belum memvalidasi format email, batas panjang password (`6..128` karakter untuk pembuatan/ubah user), serta tipe data string.
- **Remediasi**: Menggunakan `Number(amount)` dengan batas `0 < baseAmt <= 1_000_000_000`, memvalidasi `external_id` sebagai string non-kosong maks 128 karakter, memvalidasi `limit` pada rentang `1..1000`, serta menambahkan validasi tipe string, format email, dan batas panjang password pada endpoint autentikasi dan manajemen user.

### [MEDIUM] M-02: Kebocoran Header Sensitif di `/api/test-webhook` & Kurangnya HTTP Security Headers / CORS Allowlist
- **Lokasi**: `server.js`
- **Deskripsi**: `/api/test-webhook` menyimpan seluruh `req.headers` (berpotensi mencatat header `authorization`/`cookie`), serta server belum mengirimkan security headers dasar, masih mengirim `X-Powered-By: Express`, belum membatasi `express.json` limit eksplisit, dan `cors()` terbuka penuh.
- **Remediasi**: Menonaktifkan `x-powered-by`, menambahkan `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, batas `express.json({ limit: '100kb' })`, dukungan `CORS_ORIGINS` allowlist di `.env`, dan menghapus `authorization`, `cookie`, serta `x-api-key` sebelum menyimpan log ke `webhookLogs`.

### [LOW] L-01: Potensi HTML Injection pada Render Nama Merchant QRIS di Puppeteer
- **Lokasi**: `utils/qris.js` (`generateQRISImage`)
- **Deskripsi**: Nilai Tag `59` (Merchant Name) diinterpolasi langsung ke template HTML Puppeteer tanpa escaping karakter HTML.
- **Remediasi**: Menambahkan HTML entity escaping (`&`, `<`, `>`, `"`, `'`) pada `merchantName`.

---

## 5. Bukti Pengujian & Verifikasi Pasca-Remediasi

| Pengujian | Perintah / Target | Hasil |
|---|---|---|
| Audit Dependensi | `npm audit` | `PASS` (`found 0 vulnerabilities`, `sqlite3@^6.0.1` rebuilt & teruji) |
| Integritas Database SQLite | `node -e "require('./database').initDb()..."` | `PASS` (koneksi & query SQLite berjalan normal, 2 user terverifikasi) |
| Suite Verifikasi Keamanan End-to-End | `node .../verify_security.js` | `PASS` (exit code 0: security headers, JWT `exp`/`jti`, session revocation saat logout & nonaktif user, RBAC 403, rate limiter 429, SQLi & `limit` bounds, SSRF protection pada `/api/v1/charge`) |
| Penghapusan Screenshot Publik | `public/screenshot-*.png` | `PASS` (file screenshot sensitif dihapus dari `public/`) |
