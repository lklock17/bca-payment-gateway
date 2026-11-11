# BCA Payment Gateway — Comprehensive UI/UX & Responsive Mobile Architecture Specification

> **Dokumen Spesifikasi Desain & Art Direction Sistem**  
> **Target Proyek:** BCA Payment Gateway (Self-hosted QRIS & Crypto Payment System)  
> **Status Dokumen:** FINAL SPECIFICATION FOR IMPLEMENTATION  
> **Profil Pengembang:** `team-ux-ui` -> Handoff ke `team-engineer`  
> **Lokasi File:** `/home/devcurl/workspace-webui/bca/UI_SPEC.md`

---

## 1. Design Brief (8 Unsur Utama)

### 1.1 Konteks Proyek
BCA Payment Gateway adalah sistem gerbang pembayaran *self-hosted* mandiri yang mengotomasi penerimaan pembayaran **BCA QRIS Dinamis** (melalui integrasi scraping KlikBCA Merchant) dan **Cryptocurrency USDT/Multi-chain** (melalui integrasi Coinbase Commerce / direct wallet RPC). Sistem melayani:
- Admin/Merchant Operator dalam memonitor volume transaksi, mutasi KlikBCA, dan status API.
- Developer Toko Online yang menguji coba API integrasi, webhook notification, dan membaca dokumentasi teknis.
- Kasir/Operator lapangan yang sering mengakses panel admin melalui ponsel/tablet di gerai fisik.

### 1.2 Target Pengguna & Persona
1. **Merchant Owner & Kasir Lapangan**: Mengakses via smartphone (layar 360px - 430px) untuk memantau transaksi masuk secara *real-time*, melihat QRIS pembayaran untuk ditunjukkan ke pelanggan, dan memeriksa status akun BCA.
2. **Web Developer & Integrator Toko**: Mengakses via laptop/desktop untuk menyalin API Key, menguji simulasi pembayaran di `tester.html`, dan membaca panduan endpoint di `docs.html`.
3. **DevOps & System Administrator**: Memonitor stabilitas scraping KlikBCA, status sesi login BCA (active/cooldown/offline), live system logs, serta manajemen user.

### 1.3 Vibe & Estetika Visual (FinTech Enterprise Tier-1)
- **Karakter Visual**: Terinspirasi oleh standar FinTech kelas dunia (*Stripe Dashboard*, *Revolut Business*, dan *Linear App*).
- **Nuansa**: Deep Slate & Royal Navy yang prestisius, terpercaya, tajam (*crisp*), bukan sekadar efek blur transparan generik.
- **Micro-Interactions**: Hover elevation halus, glowing status badges, feedback haptic visual (`transform: scale(0.98)` saat tap di ponsel), dan animasi transisi 200–250ms cubic-bezier.
- **Aksesibilitas & Kontras**: Memenuhi standar **WCAG 2.1 AA** dengan rasio kontras teks terhadap latar belakang minimal 4.5:1, input touch target minimal 44x44px untuk kenyamanan sentuhan jari di layar mobile.

### 1.4 Referensi Desain
- **Linear App**: Layout sidebar gelap yang rapi, border halus `1px solid rgba(255, 255, 255, 0.08)`, tipografi tegas, kartu status bento yang padat informasi.
- **Stripe Dashboard**: Visualisasi data transaksi yang bersih, hirarki tipografi jelas, pill badge status dengan warna aksen lembut dan dot indikator menyala.
- **Revolut / Apple Wallet**: Desain mobile cards untuk data finansial, bottom-sheet modal untuk aksi kontekstual di smartphone, typography nominal uang yang dominan dan mudah dibaca sekilas.

### 1.5 Palet Warna & Design Tokens

```css
:root {
  /* Surface & Canvas Hierarchy */
  --bg-canvas: #030712;         /* Pitch Slate / Black Canvas */
  --bg-subtle: #070e1e;         /* Elevated background */
  --bg-surface: #0b1528;        /* Surface Cards / Sidebar */
  --bg-surface-elevated: #111f38; /* Modals, Dropdowns, Floatings */
  --bg-surface-glass: rgba(11, 21, 40, 0.75); /* Frosted Glass */

  /* BCA Brand Identity (Modernized Deep Navy & Royal Glow) */
  --bca-primary: #0044cc;       /* BCA Modern Royal Blue */
  --bca-primary-hover: #0036a3; /* BCA Royal Hover */
  --bca-primary-glow: rgba(0, 68, 204, 0.35);
  --bca-accent-cyan: #38bdf8;   /* Secondary Cyan Accent */
  --bca-navy-dark: #001f5c;     /* Deep Heritage BCA Navy */

  /* Semantic Feedback & Status (FinTech Standard) */
  --success: #10b981;           /* Emerald 500 - Transaksi Sukses / BCA Terkoneksi */
  --success-bg: rgba(16, 185, 129, 0.12);
  --success-border: rgba(16, 185, 129, 0.28);
  --success-glow: rgba(16, 185, 129, 0.35);

  --warning: #f59e0b;           /* Amber 500 - Pending / Cooldown */
  --warning-bg: rgba(245, 158, 11, 0.12);
  --warning-border: rgba(245, 158, 11, 0.28);

  --danger: #ef4444;            /* Rose 500 - Failed / Offline / Delete */
  --danger-bg: rgba(239, 68, 68, 0.12);
  --danger-border: rgba(239, 68, 68, 0.28);

  --crypto-purple: #8b5cf6;     /* Purple/Indigo for Web3 / Coinbase */
  --crypto-bg: rgba(139, 92, 246, 0.12);
  --crypto-border: rgba(139, 92, 246, 0.3);

  /* Typography Colors */
  --text-main: #f8fafc;         /* White Slate */
  --text-secondary: #94a3b8;    /* Slate 400 */
  --text-muted: #64748b;        /* Slate 500 */
  --text-placeholder: #475569;  /* Slate 600 */

  /* Borders & Dividers */
  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-strong: rgba(255, 255, 255, 0.14);
  --border-focus: rgba(56, 189, 248, 0.5);

  /* Elevation Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 16px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 12px 32px -4px rgba(0, 0, 0, 0.7), 0 4px 6px -2px rgba(0, 0, 0, 0.5);
  --shadow-glow-blue: 0 0 24px -4px rgba(0, 68, 204, 0.45);
}
```

### 1.6 Tipografi
- **Headings & Key Metrics**: `'Outfit'`, sans-serif (Geometric, modern, premium FinTech weight 600 & 700, tight tracking `-0.025em`).
- **Body UI & Forms**: `'Plus Jakarta Sans'`, sans-serif (Sangat nyaman dibaca di resolusi layar smartphone kecil, weight 400, 500, 600).
- **Data Kode / Payload / Alamat Wallet / API Key**: `'JetBrains Mono'`, `'Fira Code'`, monospace (Clean tabular numbers, legibilitas tinggi untuk hash transaksi dan nominal mata uang).

### 1.7 Struktur Layout Responsif Mobile & Desktop
- **Desktop (Layar ≥ 1024px)**:
  - Sidebar vertikal permanen (lebar 260px) dengan logo BCA Gateway, navigasi menu, indikator status sistem, dan footer profil user.
  - Main area dengan padding lapang (36px–40px), Grid Bento Stats 4 kolom, tabel data interaktif dengan sorting/filter bar.
  - Floating Logs Widget berupa pill bubble di pojok kanan bawah dengan popup panel melayang.
- **Tablet (768px – 1023px)**:
  - Sidebar yang dapat di-collapse, grid stats 2 kolom, tabel data dengan scroll horizontal terjaga via wrapper card.
- **Mobile (< 768px)**:
  - **Sticky Mobile Topbar (56px)** memuat Hamburger Menu toggle, Logo BCA Gateway ringkas, status chip, dan Avatar.
  - **Off-Canvas Navigation Drawer**: Menutupi layar dengan backdrop blur 16px saat dibuka, item navigasi ukuran touch-target 48px.
  - **Transformasi Tabel menjadi Mobile Card View**: Menghilangkan horizontal scrollbar kaku; setiap transaksi dan akun merchant tampil sebagai kartu bertumpuk elegan dengan badge menyala dan tombol aksi jelas.
  - **Bottom-Sheet Modal & Floating Log Panel**: Log panel dan modal otomatis bertransformasi menjadi iOS-style Bottom Sheet (muncul dari bawah layar dengan swipe/close bar).

### 1.8 Hal yang Harus Dihindari (*Anti-Patterns*)
- **DILARANG**: Membiarkan sidebar desktop statis `position: fixed; width: 260px; margin-left: 260px` di mobile tanpa media query, yang membuat layar ponsel terpotong dan tidak dapat dibaca.
- **DILARANG**: Membiarkan tabel data lebar `<table>` meluap ke samping (*overflow breakage*) di mobile tanpa konversi ke format Card List.
- **DILARANG**: Floating live logs panel (lebar 420px) menutupi 90% layar smartphone dan tidak bisa di-scroll atau ditutup dengan mudah.
- **DILARANG**: Elemen tombol atau tap target lebih kecil dari 44x44px di tampilan mobile (menyebabkan salah sentuh jari pengguna).
- **DILARANG**: Menggunakan font-size input form di bawah 16px pada perangkat iOS (karena akan memicu auto-zoom browser Safari yang merusak tata letak).
- **DILARANG**: String hash API key, payload QRIS, atau alamat crypto yang panjang merusak layout (*harus menggunakan truncated string dengan 1-tap copy button*).

---

## 2. Arsitektur Responsif Mobile Terperinci

### 2.1 Pola Navigasi Mobile

#### A. Mobile Sticky Topbar
```
+-------------------------------------------------------------+
| [≡ Menu]   [BCA Gateway Icon] BCA Gateway      (Avatar: A)  |
+-------------------------------------------------------------+
```
- **Tinggi**: 56px tetap di bagian paling atas layar (`position: sticky; top: 0; z-index: 1000;`).
- **Komponen**:
  - Tombol Hamburger (icon 24px, touch area 48x48px).
  - Logo Brand & Title (font Outfit, 1.15rem, semi-bold).
  - Status Live Indicator (dot hijau kecil penanda sistem scraper online).
  - Avatar lingkaran profil pengguna.

#### B. Off-Canvas Drawer Navigation
```
+------------------------------------+------------------------+
| BCA Gateway               [X Tutup]|                        |
|                                    |                        |
|  [■] Overview                      |    (Semi-transparent   |
|  [🏦] Akun BCA Merchant             |     Dark Backdrop      |
|  [⚡] Transaksi QRIS & Crypto      |     with Blur 12px)    |
|  [👥] Manajemen User (Admin)       |                        |
|  [📖] Dokumentasi API (Publik)      |    [Tap backdrop to    |
|  [🧪] API & Webhook Tester         |         close]         |
|                                    |                        |
| ---------------------------------- |                        |
|  User: admin@gateway.com (Admin)   |                        |
|  [🚪 Keluar / Logout]              |                        |
+------------------------------------+------------------------+
```
-Bergeser dari sisi kiri (`transform: translateX(-100%)` ke `translateX(0)`), transisi halus 250ms.
- Navigasi link memiliki padding sentuh `padding: 14px 18px`, border-radius 10px, dan visual active state tegas (Royal Blue glow line).
- **Aksesibilitas Drawer**: Wajib menyertakan `role="dialog"`, `aria-modal="true"`, `aria-label="Navigasi Utama"`, trap focus saat terbuka, dan dukungan tombol `Escape` untuk menutup drawer.

#### C. Floating Bottom Navigation Bar (Mobile Quick-Switch)
Untuk akses satu tangan (thumb-zone) di ponsel tanpa selalu membuka hamburger drawer, tersedia **Bottom Navigation Bar** melayang di bagian bawah viewport (`< 768px`) dengan dukungan *Safe Area* perangkat modern (`env(safe-area-inset-bottom)`):
```
+-------------------------------------------------------------+
|  [📊 Overview]   [🏦 Merchant]   [⚡ Transaksi]   [🪵 Logs]  |
+-------------------------------------------------------------+
```
- **Item Utama (Maks. 4 item + akses Drawer untuk menu sekunder)**:
  1. **Overview** (`data-tab="overview"`)
  2. **Merchant** (`data-tab="merchants"`)
  3. **Transaksi** (`data-tab="transactions"`)
  4. **Live Logs** (Toggle Bottom-Sheet Log Console + dot badge merah bila ada `warn`/`error` baru)
- **Aturan Layout**:
  - `position: fixed; bottom: 12px; left: 12px; right: 12px;` (gaya *Floating Pill Dock* dengan `backdrop-filter: blur(18px)` dan `padding-bottom: env(safe-area-inset-bottom)`).
  - Konten utama (`main.main-content`) diberi `padding-bottom: calc(96px + env(safe-area-inset-bottom))` agar baris terakhir kartu mobile tidak tertutup dock navigasi.
  - Saat tab **Manajemen User** (Admin-only) atau **Dokumentasi API / Tester** ingin diakses di mobile, pengguna membuka **Off-Canvas Drawer** melalui Hamburger icon di Topbar.

---

### 2.1.1 User Flow & Information Hierarchy

```
[Login (/index.html)]
   ├── Berhasil (Admin/User) ──> [Dashboard (/dashboard.html)]
   │      ├── Overview: KPI Bento Grid -> Riwayat Terbaru -> Quick QR/Status
   │      ├── Akun Merchant: Status Scraper BCA/Crypto -> Copy API Key -> Tambah/Edit Modal
   │      ├── Transaksi QRIS/Crypto: Search & Filter -> Mobile Card / Table -> Lihat QR / Simulasi / Explorer
   │      ├── Manajemen User (Admin): List User -> Tambah/Edit/Hapus User
   │      └── Live Logs (Floating/Bottom Sheet): Filter Log -> Auto-scroll -> Clear
   └── Link Publik ──> [Dokumentasi API (/docs.html)] & [API Tester (/tester.html)]
```

**Hirarki Informasi per Layar**:
1. **Level 1 (Primer - Sekilas Pandang)**: Nominal uang (`Rp ...` / `USDT`), Status Transaksi (`SUKSES`/`PENDING`), Status Koneksi Scraper BCA (`AKTIF`/`COOLDOWN`/`OFFLINE`).
2. **Level 2 (Sekunder - Identitas)**: Nama Merchant, External Order ID, Metode Pembayaran (`QRIS`/`Crypto`), API Key (terpotong + tombol salin).
3. **Level 3 (Tersier - Metadata & Aksi Lanjut)**: Timestamp WIB, ID internal transaksi, raw payload QRIS, log detail sistem.

---

### 2.1.2 State Kosong, Loading (Skeleton), Error & Interaksi Aksesibilitas

Setiap komponen data wajib menangani **4 state lengkap** (tidak boleh membiarkan layar kosong putih/gelap tanpa umpan balik):

1. **Loading State (Skeleton Shimmer)**:
   - KPI Cards menampilkan shimmer bar abu-abu kebiruan (`1.5s infinite`) pada `.stat-value` dan `.stat-footer`.
   - Table/Mobile Card List menampilkan 3 kartu skeleton dummy sebelum respons `/api/*` selesai.
2. **Empty State (Data Kosong)**:
   - Ikon SVG subtle (48px, opacity 0.5) + pesan kontekstual + tombol CTA utama (misal: *"Belum ada transaksi"* + *"Buka API Tester"*; *"Belum ada merchant"* + *"Tambah Merchant Pertama"*).
3. **Error State (Kegagalan Jaringan / API 4xx/5xx)**:
   - Banner alert inline (`--danger-bg`, `--danger-border`) berisi pesan error yang jelas + tombol **"Coba Lagi"** yang memanggil ulang loader fungsi terkait (selain toast notifikasi).
4. **Destructive Confirmation (Pengganti `window.confirm()`)**:
   - Aksi hapus Merchant/User disarankan menggunakan *Confirmation Modal / Bottom Sheet* beraksen `--danger` agar konsisten di desktop & mobile, bukan native browser dialog.
5. **Keyboard Navigation & Focus State**:
   - Seluruh elemen interaktif wajib memakai `:focus-visible` dengan ring fokus tajam `outline: 2px solid var(--bca-cyan); outline-offset: 2px;`.
   - Dukungan `@media (prefers-reduced-motion: reduce)` untuk menonaktifkan animasi transisi/pulse bagi pengguna sensitif gerak.
   - Kontras teks minimum 4.5:1 (`#f8fafc` dan `#94a3b8` di atas `#0b1528` / `#030712`).

---

### 2.2 Transformasi Tabel Menjadi "Mobile Card View" (< 768px)

Pada layar desktop, data ditampilkan menggunakan HTML `<table>` klasik. Namun pada layar smartphone (< 768px), aturan CSS utility secara otomatis menyembunyikan header tabel desktop dan mengonversi setiap baris `<tr>` menjadi sebuah **FinTech Card** mandiri.

#### Desain Mobile Card untuk Transaksi QRIS & Crypto
```
+-------------------------------------------------------------+
| #TX-1049  •  Toko Cabang Surabaya        [ SUKSES • QRIS ]  |
|                                                             |
| Nominal Transaksi:                                          |
| Rp 150.142                                                  |
|                                                             |
| ID Eksternal : INV-20260408-01                              |
| Waktu        : 11 Nov 2026, 14:32:05 WIB                    |
|                                                             |
| [ 🔍 Lihat QRIS ]           [ ⚡ Simulasi Bayar ]           |
+-------------------------------------------------------------+
```
**Aturan Perilaku**:
- Nominal uang ditampilkan sangat mencolok (`font-size: 1.45rem; font-weight: 700; color: #fff; font-family: Outfit;`).
- ID Transaksi dan ID Eksternal diformat dengan font monospace agar presisi.
- Tombol aksi (*Lihat QR / Simulasi / Etherscan*) menjadi flex row tombol dengan lebar seimbang (min-height 44px) yang nyaman ditekan ibu jari.

#### Desain Mobile Card untuk Akun Merchant
```
+-------------------------------------------------------------+
| Merchant: Toko Berkah Mandiri              [ BCA: AKTIF ]   |
| BCA User: kasir.toko1@bca.co.id            [ Crypto: AKTIF ]|
|                                                             |
| API Key Toko:                                               |
| [ BCA-GW-8F2A...3D91                  ] [ 📋 Salin Key ]    |
|                                                             |
| Kredensial Terpasang:                                       |
| • KlikBCA Scraper: Terhubung (Auto-scraping)                |
| • Coinbase Crypto: Polygon / Arbitrum Active                |
|                                                             |
| [ ✏️ Edit Akun ]                      [ 🗑️ Hapus Merchant ] |
+-------------------------------------------------------------+
```

---

### 2.3 Penyesuaian Modal & Floating Live Logs Widget

#### Transformasi Floating Live Logs:
- **Di Desktop (≥ 768px)**:
  - Tombol bundar mengapung 50x50px di sudut kanan bawah.
  - Saat diklik, membuka popover melayang `420px x 520px` di atas tombol.
- **Di Ponsel (< 768px)**:
  - Tombol bubble tetap melayang di atas safe-area (bottom: 20px, right: 20px).
  - Saat dibuka, panel log bertransformasi menjadi **Mobile Bottom Sheet**:
    - Lebar 100% layar, menempel di bagian paling bawah.
    - Tinggi 75vh (75% tinggi viewport).
    - Memiliki **Drag / Handle Indicator** di bagian atas (pill bar abu-abu 40x4px) untuk rasa interaksi native app.
    - Border-radius atas `20px 20px 0 0`.
    - Auto-scroll lock dan search bar filter cepat yang nyaman diketik keyboard ponsel.

#### Penyesuaian Dialog Modals (Tambah Merchant, Tambah User, QR Code View):
- Di desktop: modal centered dialog `max-width: 500px`.
- Di mobile: modal menjadi **Bottom-Sheet Modal** yang mengisi 92% layar dengan scroll vertikal mandiri (`-webkit-overflow-scrolling: touch;`), tombol close yang besar di sudut kanan atas, serta tombol form simpan/batal yang menempel (*sticky*) di bawah.

---

## 3. Spesifikasi Rombakan Halaman Per Halaman

### 3.1 Halaman Login (`public/index.html`)
- **Struktur Baru**:
  - Background: Deep void `#030712` dengan double radial mesh glow (BCA Royal Blue di kiri atas dan Emerald glow di kanan bawah).
  - Centered Auth Box (max-width: 420px di desktop, 92% width di mobile).
  - **Brand Badge**: Logo BCA SVG baru dengan glowing shadow, judul "BCA Payment Gateway" bergradien kristal putih ke perak.
  - **Form Input Modern**:
    - Input Email dan Password dengan icon SVG di sisi kiri dalam field.
    - Focus state: border glow `#0044cc`, background input gelap `#0b1528`.
    - Tombol "Masuk ke Panel" dengan efek hover elevasi dan loading state interaktif.
  - **Quick Role Guidance & Documentation Link**:
    - Tautan cepat ke `/docs.html` dan `/tester.html` yang terformat rapi dan mobile-friendly.

### 3.2 Halaman Dashboard Admin & Merchant (`public/dashboard.html`)
- **Navigasi Tab Interaktif**:
  1. **Tab 1: Overview**
     - Bento KPI Grid 4 Card:
       - **Volume Transaksi Sukses**: Total rupiah terformat rapi + icon tren.
       - **Jumlah Transaksi**: Counter total + badge jumlah pending.
       - **Tingkat Keberhasilan (Success Rate)**: Indikator persentase + progress bar mikro.
       - **Akun Merchant Aktif**: Status jumlah gerai/merchant terhubung.
     - Riwayat Transaksi Terbaru: Mobile Card View di ponsel, Data Table di desktop.
  2. **Tab 2: Akun BCA Merchant**
     - Header bar dengan tombol aksi: "Tambah Merchant" (Primary) dan "Refresh Status BCA" (Secondary).
     - Status Sesi BCA Scraper: Indikator visual real-time (`AKTIF` hijau menyala, `COOLDOWN` kuning berkedip, `OFFLINE` merah).
     - Satu-sentuhan copy untuk Merchant API Key.
  3. **Tab 3: Transaksi QRIS & Crypto**
     - Filter Bar Responsif: Search input (cari external ID / nominal / ID transaksi) + Dropdown filter status (Semua / Pending / Sukses) yang berjejer rapi di desktop dan bertumpuk vertikal di smartphone.
     - Interaksi QRIS View Modal: Tampilan QR code dinamis resolusi tinggi dengan latar belakang kontras putih, countdown auto-refresh, dan tombol salin raw QR payload.
     - Quick Payment Simulation Button: Tombol simulasi bayar instan untuk keperluan testing.
  4. **Tab 4: Manajemen User (Admin Only)**
     - Akses terbatas hanya untuk role administrator.
     - Card / Table list admin & operator kasir, pengaturan role, reset password, dan proteksi akun superadmin agar tidak terhapus.
  5. **Tab 5: Quick Link ke Dokumentasi & Tester**
     - Navigasi cepat tanpa perlu keluar dari konteks dashboard.

### 3.3 Halaman Tester Integrasi (`public/tester.html`)
- **Masalah Lama**: Grid 2 kolom kaku membuat layout saling bertabrakan pada layar di bawah 900px.
- **Rombakan Baru**:
  - Responsif 1-kolom di mobile (< 900px) dan 2-kolom seimbang di desktop.
  - **Step 1: Request Configurator Card**:
    - Dropdown API Key otomatis atau input manual.
    - Toggle metode pembayaran: Tab switch interaktif antara **BCA QRIS Dinamis** dan **Crypto USDT**.
    - Auto-generator tombol untuk Order ID acak.
  - **Step 2: Interactive Payment Invoice Display**:
    - **Mode QRIS**: Menampilkan gambar QR dinamis, nominal yang dihasilkan otomatis dengan kode unik, status polling live KlikBCA.
    - **Mode Crypto USDT**: Menampilkan Network Switcher (*Polygon / Arbitrum One / Ethereum*), kalkulasi otomatis USDT dari kurs IDR real-time, QR Code EIP-681 untuk scan otomatis dompet Web3 (MetaMask/TrustWallet), wallet address copy box, dan link direct explorer.
  - **Step 3: Live Webhook Logger Card**:
    - Terminal feed yang menangkap payload HTTP POST callback ketika pembayaran sukses dikonfirmasi oleh sistem.
    - Syntax formatted JSON card dengan tombol "Hapus Log" dan status visual timestamp.

### 3.4 Halaman Dokumentasi API (`public/docs.html`)
- **Masalah Lama**: Sidebar dokumentasi tersembunyi sepenuhnya di mobile (`display: none`), sehingga navigasi bab dokumentasi di ponsel hilang.
- **Rombakan Baru**:
  - Di mobile, ditambahkan **Sub-header Dropdown Selector** atau **Horizontal Scrollable Nav Pill** di atas konten sehingga pengguna ponsel tetap dapat berpindah bab (*Pengenalan, Autentikasi, Charge API, Status API, Webhook Callback, Contoh Kode*).
  - Code Snippets (cURL, PHP, NodeJS) diformat dengan tab yang responsif, scroll horizontal kode yang halus tanpa merusak layout container, dan tombol "Salin Kode" yang selalu terlihat (*sticky header* pada code-block).
  - Parameter Tables diubah menjadi format Card Parameter bersarang di mobile untuk keterbacaan optimal.

---

## 4. Komponen CSS Tokens & Utility Classes Siap Pakai

Berikut adalah implementasi stylesheet modern yang harus diinjeksikan ke dalam `public/css/style.css` untuk menggantikan styling lama:

```css
/* ==========================================================================
   BCA PAYMENT GATEWAY — TIER-1 ENTERPRISE DESIGN SYSTEM
   Modern Dark Slate, Deep Royal BCA Navy & Mobile-First Responsive System
   ========================================================================== */

@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

:root {
  /* Surface & Background Hierarchy */
  --bg-canvas: #030712;
  --bg-subtle: #070f21;
  --bg-surface: #0b1528;
  --bg-surface-elevated: #111e38;
  --bg-glass: rgba(11, 21, 40, 0.72);
  --bg-glass-card: rgba(15, 23, 42, 0.65);

  /* BCA Corporate FinTech Color System */
  --bca-blue: #0044cc;
  --bca-blue-hover: #0036a3;
  --bca-blue-light: #2563eb;
  --bca-blue-glow: rgba(0, 68, 204, 0.35);
  --bca-cyan: #38bdf8;

  /* Semantic Feedback Tokens */
  --success: #10b981;
  --success-glow: rgba(16, 185, 129, 0.25);
  --success-bg: rgba(16, 185, 129, 0.12);
  --success-border: rgba(16, 185, 129, 0.3);

  --warning: #f59e0b;
  --warning-glow: rgba(245, 158, 11, 0.25);
  --warning-bg: rgba(245, 158, 11, 0.12);
  --warning-border: rgba(245, 158, 11, 0.3);

  --danger: #ef4444;
  --danger-glow: rgba(239, 68, 68, 0.25);
  --danger-bg: rgba(239, 68, 68, 0.12);
  --danger-border: rgba(239, 68, 68, 0.3);

  --crypto: #8b5cf6;
  --crypto-bg: rgba(139, 92, 246, 0.12);
  --crypto-border: rgba(139, 92, 246, 0.3);

  /* Typography Colors */
  --text-main: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --text-invert: #030712;

  /* Borders & Dividers */
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);
  --border-active: rgba(56, 189, 248, 0.6);

  /* Typography Font Stacks */
  --font-display: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-body: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Transitions & Radii */
  --transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 22px;
  --radius-full: 9999px;

  /* Responsive Spacing & Header Heights */
  --mobile-header-height: 58px;
  --sidebar-width: 260px;
}

/* Focus Visible Accessibility */
:focus-visible {
  outline: 2px solid var(--bca-cyan);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Skeleton Loading Shimmer */
.skeleton {
  background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 37%, rgba(255,255,255,0.04) 63%);
  background-size: 400% 100%;
  animation: skeleton-loading 1.4s ease infinite;
  border-radius: var(--radius-sm);
}

@keyframes skeleton-loading {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

/* Empty State Component */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 20px;
  color: var(--text-secondary);
}

.empty-state-icon {
  width: 56px;
  height: 56px;
  margin-bottom: 16px;
  color: var(--text-muted);
  opacity: 0.7;
}

.empty-state-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 6px;
}

.empty-state-desc {
  font-size: 0.88rem;
  color: var(--text-secondary);
  max-width: 360px;
  margin-bottom: 20px;
}

/* Floating Bottom Navigation Bar (< 768px) */
.mobile-bottom-nav {
  display: none;
  position: fixed;
  bottom: 12px;
  left: 12px;
  right: 12px;
  height: 64px;
  background: rgba(11, 21, 40, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  z-index: 1050;
  padding: 0 10px;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.mobile-bottom-nav-list {
  display: flex;
  align-items: center;
  justify-content: space-around;
  height: 100%;
  list-style: none;
  margin: 0;
  padding: 0;
}

.mobile-bottom-nav-item {
  flex: 1;
  text-align: center;
}

.mobile-bottom-nav-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.72rem;
  font-weight: 500;
  padding: 8px 4px;
  border-radius: var(--radius-md);
  transition: var(--transition-fast);
  position: relative;
}

.mobile-bottom-nav-link svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
}

.mobile-bottom-nav-link:active,
.mobile-bottom-nav-link.active {
  color: var(--bca-cyan);
}

.mobile-bottom-nav-link.active::after {
  content: '';
  position: absolute;
  top: 2px;
  width: 16px;
  height: 3px;
  background: var(--bca-cyan);
  border-radius: var(--radius-full);
}

/* ==========================================================================
   Base & Reset
   ========================================================================== */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  scroll-behavior: smooth;
}

body {
  background-color: var(--bg-canvas);
  background-image: 
    radial-gradient(circle at 10% 0%, rgba(0, 68, 204, 0.15) 0%, transparent 40%),
    radial-gradient(circle at 90% 100%, rgba(16, 185, 129, 0.08) 0%, transparent 40%),
    radial-gradient(circle at 50% 50%, rgba(11, 21, 40, 0.5) 0%, transparent 100%);
  background-attachment: fixed;
  color: var(--text-main);
  font-family: var(--font-body);
  font-size: 0.95rem;
  line-height: 1.6;
  min-height: 100vh;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: #ffffff;
}

/* ==========================================================================
   Modern FinTech Glass Panels & Cards
   ========================================================================== */
.glass-panel {
  background: var(--bg-glass-card);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
  transition: var(--transition-normal);
}

.glass-panel:hover {
  border-color: var(--border-strong);
}

/* ==========================================================================
   Typography & Interactive Text Utilities
   ========================================================================== */
.text-gradient {
  background: linear-gradient(135deg, #ffffff 30%, #94a3b8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.text-gradient-bca {
  background: linear-gradient(135deg, #ffffff 20%, #38bdf8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.font-mono {
  font-family: var(--font-mono);
}

/* ==========================================================================
   Buttons (Touch-Friendly: Min 44px Height on Touch)
   ========================================================================== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  padding: 10px 20px;
  font-family: var(--font-display);
  font-size: 0.92rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: var(--transition-fast);
  text-decoration: none;
  user-select: none;
  white-space: nowrap;
}

.btn:active {
  transform: scale(0.98);
}

.btn-primary {
  background: linear-gradient(135deg, var(--bca-blue), var(--bca-blue-light));
  color: #ffffff;
  box-shadow: 0 4px 14px var(--bca-blue-glow);
}

.btn-primary:hover {
  background: linear-gradient(135deg, var(--bca-blue-hover), var(--bca-blue));
  box-shadow: 0 6px 20px var(--bca-blue-glow);
  color: #ffffff;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--border-subtle);
  color: var(--text-main);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--border-strong);
  color: #ffffff;
}

.btn-danger {
  background: var(--danger-bg);
  color: #f87171;
  border-color: var(--danger-border);
}

.btn-danger:hover {
  background: #dc2626;
  color: #ffffff;
}

.btn-sm {
  min-height: 34px;
  padding: 6px 14px;
  font-size: 0.82rem;
  border-radius: var(--radius-sm);
}

.btn-block {
  width: 100%;
}

/* ==========================================================================
   Inputs, Selects & Forms (Auto-Zoom Preventer: font-size 16px)
   ========================================================================== */
.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-control {
  width: 100%;
  padding: 12px 16px;
  background: rgba(11, 21, 40, 0.85);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-main);
  font-family: inherit;
  font-size: 1rem; /* iOS Safari zoom prevention */
  transition: var(--transition-fast);
}

.form-control:focus {
  outline: none;
  border-color: var(--bca-blue);
  box-shadow: 0 0 0 3px rgba(0, 68, 204, 0.25);
  background: rgba(15, 27, 50, 0.95);
}

/* ==========================================================================
   Pill Status Badges
   ========================================================================== */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.badge-success {
  background: var(--success-bg);
  color: var(--success);
  border: 1px solid var(--success-border);
}
.badge-success .badge-dot { background-color: var(--success); box-shadow: 0 0 8px var(--success); }

.badge-pending {
  background: var(--warning-bg);
  color: var(--warning);
  border: 1px solid var(--warning-border);
}
.badge-pending .badge-dot { background-color: var(--warning); }

.badge-danger {
  background: var(--danger-bg);
  color: #f87171;
  border: 1px solid var(--danger-border);
}
.badge-danger .badge-dot { background-color: var(--danger); }

.badge-crypto {
  background: var(--crypto-bg);
  color: #a78bfa;
  border: 1px solid var(--crypto-border);
}

/* ==========================================================================
   Layout Desktop vs Mobile
   ========================================================================== */
.dashboard-wrapper {
  display: flex;
  min-height: 100vh;
}

/* Desktop Sidebar */
.sidebar {
  width: var(--sidebar-width);
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  padding: 28px 18px;
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
  transition: transform var(--transition-normal);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.3rem;
  font-weight: 700;
  font-family: var(--font-display);
  padding: 0 8px 24px 8px;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 24px;
}

.sidebar-menu {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sidebar-item a {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: var(--radius-md);
  font-weight: 500;
  transition: var(--transition-fast);
}

.sidebar-item a:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #ffffff;
}

.sidebar-item.active a {
  background: rgba(0, 68, 204, 0.16);
  color: #ffffff;
  border-left: 3px solid var(--bca-blue);
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}

/* Main Content Area */
.main-content {
  margin-left: var(--sidebar-width);
  flex: 1;
  padding: 36px 40px;
  min-width: 0;
  transition: margin-left var(--transition-normal);
}

/* Mobile Topbar (Hidden on Desktop) */
.mobile-topbar {
  display: none;
}

/* Backdrop Overlay for Mobile Drawer */
.mobile-drawer-backdrop {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(3, 7, 18, 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1090;
  opacity: 0;
  transition: opacity var(--transition-normal);
  pointer-events: none;
}

.mobile-drawer-backdrop.active {
  display: block;
  opacity: 1;
  pointer-events: auto;
}

/* ==========================================================================
   Stats Bento Grid
   ========================================================================== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.stat-card {
  padding: 22px 24px;
}

.stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 12px;
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
}

.stat-value {
  font-size: 1.85rem;
  font-weight: 700;
  font-family: var(--font-display);
  color: #ffffff;
}

.stat-footer {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 8px;
}

/* ==========================================================================
   Desktop Table vs Mobile Card Transformations
   ========================================================================== */
.table-responsive-wrapper {
  overflow-x: auto;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  background: rgba(11, 21, 40, 0.5);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.data-table th {
  padding: 16px 20px;
  background: rgba(15, 23, 42, 0.85);
  font-size: 0.8rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
  font-weight: 600;
  border-bottom: 1px solid var(--border-subtle);
}

.data-table td {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 0.92rem;
}

.data-table tr:hover td {
  background: rgba(255, 255, 255, 0.02);
}

/* Mobile Card View Container (Visible on Mobile only) */
.mobile-card-list {
  display: none;
  flex-direction: column;
  gap: 16px;
}

.mobile-data-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.mobile-data-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.mobile-data-card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

.mobile-data-card-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  margin-top: 4px;
}

.mobile-data-card-actions .btn {
  flex: 1;
}

/* ==========================================================================
   Modals & Bottom-Sheet Behavior
   ========================================================================== */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(3, 7, 18, 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: none;
  justify-content: center;
  align-items: center;
  z-index: 1200;
  opacity: 0;
  transition: opacity var(--transition-normal);
  padding: 20px;
}

.modal-overlay.active {
  display: flex;
  opacity: 1;
}

.modal-content {
  width: 100%;
  max-width: 520px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  padding: 32px;
  position: relative;
  transform: scale(0.95);
  transition: transform var(--transition-normal);
  box-shadow: var(--shadow-lg);
  max-height: 90vh;
  overflow-y: auto;
}

.modal-overlay.active .modal-content {
  transform: scale(1);
}

.modal-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  color: var(--text-secondary);
  font-size: 1.3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-fast);
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* ==========================================================================
   Mobile Bottom-Sheet Drag Handle
   ========================================================================== */
.bottom-sheet-handle {
  display: none;
  width: 44px;
  height: 5px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-full);
  margin: 0 auto 16px auto;
}

/* ==========================================================================
   Responsive Breakpoints (< 768px Mobile Rules)
   ========================================================================== */
@media (max-width: 767px) {
  /* Hide Desktop Sidebar by default, slide in when active */
  .sidebar {
    transform: translateX(-100%);
    width: 280px;
    z-index: 1100;
    box-shadow: 10px 0 30px rgba(0, 0, 0, 0.6);
  }

  .sidebar.mobile-open {
    transform: translateX(0);
  }

  /* Show Floating Bottom Nav on Mobile */
  .mobile-bottom-nav {
    display: block;
  }

  /* Main content adjusts to full width & safe bottom padding */
  .main-content {
    margin-left: 0 !important;
    padding: 16px 16px calc(88px + env(safe-area-inset-bottom, 0px)) 16px;
    width: 100%;
  }

  /* Show Sticky Mobile Topbar */
  .mobile-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: var(--mobile-header-height);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
    padding: 0 16px;
    position: sticky;
    top: 0;
    z-index: 1000;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .mobile-menu-trigger {
    background: none;
    border: none;
    color: var(--text-main);
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .mobile-menu-trigger:active {
    background: rgba(255, 255, 255, 0.08);
  }

  /* Table Hide & Card List Show */
  .table-responsive-wrapper {
    display: none;
  }

  .mobile-card-list {
    display: flex;
  }

  /* Stats Grid 2-column on mobile */
  .stats-grid {
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .stat-card {
    padding: 16px;
  }

  .stat-value {
    font-size: 1.4rem;
  }

  /* Modals convert into Bottom-Sheet on phone */
  .modal-overlay {
    padding: 0;
    align-items: flex-end;
  }

  .modal-content {
    max-width: 100%;
    border-radius: 20px 20px 0 0;
    padding: 24px 20px;
    transform: translateY(100%);
    max-height: 85vh;
  }

  .modal-overlay.active .modal-content {
    transform: translateY(0);
  }

  .bottom-sheet-handle {
    display: block;
  }

  /* Floating Log Widget transforms to Bottom Sheet */
  .log-panel {
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    height: 75vh !important;
    max-height: 75vh !important;
    border-radius: 20px 20px 0 0 !important;
    transform: translateY(100%) !important;
  }

  .log-panel.active {
    transform: translateY(0) !important;
  }
}
```

---

## 5. Rencana Transisi & Checklist Implementasi

### 5.1 Checklist Pembaruan Frontend
- [ ] **CSS Modernisasi (`public/css/style.css`)**:
  - Ganti warna flat lama dengan Design Tokens FinTech Enterprise.
  - Tambahkan utility classes untuk `.mobile-card-list`, `.mobile-data-card`, dan media query breakpoint `< 768px`.
  - Pasang aturan touch-friendly: minimum touch height 44px dan input font-size 16px.
- [ ] **Auth / Login (`public/index.html`)**:
  - Tambahkan Brand Icon SVG baru bernuansa FinTech.
  - Perbaiki alignment responsive container pada layar smartphone (360px–414px).
  - Berikan feedback loading visual yang smooth.
- [ ] **Dashboard (`public/dashboard.html`)**:
  - Tambahkan HTML `.mobile-topbar` dengan tombol hamburger dan backdrop drawer `.mobile-drawer-backdrop`.
  - Tambahkan elemen `.mobile-card-list` untuk tab Transaksi, Akun Merchant, dan User.
  - Update skrip JavaScript `dashboard.html` agar me-render kedua target view (tabel desktop dan card view mobile).
  - Transformasi Floating Live Log widget menjadi native-feel Mobile Bottom Sheet saat layar kecil.
- [ ] **API Tester (`public/tester.html`)**:
  - Ubah layout flex/grid menjadi 1-kolom bertumpuk di ponsel.
  - Perbaiki container QR Code agar auto-scale responsif tanpa horizontal scroll.
  - Tambahkan 1-tap copy button dengan feedback toast yang elegan.
- [ ] **Dokumentasi API (`public/docs.html`)**:
  - Tambahkan navigasi mobile (dropdown / horizontal navigation bar).
  - Buat code-block container scrollable secara mandiri tanpa memotong margin halaman.

### 5.2 Standar Penerimaan (*Acceptance Criteria*)
1. Tidak ada elemen yang terpotong secara horizontal di viewport 360px (Samsung Galaxy / iPhone SE).
2. Drawer navigasi dapat dibuka dan ditutup dengan mulus di mobile melalui tombol hamburger maupun tap di area backdrop.
3. Seluruh tabel transaksi dan merchant berubah menjadi kartu-kartu rapi di mobile view dengan tombol aksi berukuran sentuh nyaman.
4. Widget Live Logs dan Modal Form tampil dalam mode bottom sheet di mobile tanpa menutupi seluruh layar secara kaku.
5. Estetika konsisten dengan palet BCA Modern FinTech (Deep Navy `#0044cc`, Pitch Slate `#030712`, Emerald `#10b981`).

### 5.3 Kontrak Integrasi DOM & JavaScript (`team-engineer`)

Agar perombakan UI/UX berjalan mulus tanpa merusak fungsionalitas yang ada, berikut kontrak teknis elemen DOM dan temuan audit kode:

#### A. Temuan Audit Bug pada Kode Eksisting:
1. **Sidebar Tab Link Trap (`dashboard.html` line 705–720)**:
   - *Masalah*: Event listener `sidebarItems.forEach` dipasang ke semua `.sidebar-item`, termasuk link Dokumentasi API (`<a href="/docs.html">` tanpa `data-tab`). Ketika diklik, listener memanggil `e.preventDefault()`, menyebabkan navigasi ke `/docs.html` gagal dan mencoba mengaktifkan tab `#nullTab`.
   - *Solusi Desain*: Hanya pasang tab switch listener pada item yang memiliki atribut `[data-tab]`. Link eksternal (`/docs.html`, `/tester.html`) dibiarkan bernavigasi normal.
2. **Colspan Mismatch pada Baris Kosong (`dashboard.html` line 776 & line 871)**:
   - *Masalah*: `thead` transaksi memiliki 8 kolom (`ID Transaksi, Merchant, ID Eksternal, Metode, Nominal, Status, Waktu, Aksi`), tetapi empty state menggunakan `colspan="7"`.
   - *Solusi*: Ubah ke `colspan="8"` untuk tabel desktop, dan render template `.empty-state` mandiri untuk `.mobile-card-list`.
3. **Insecure Context Clipboard Fallback**:
   - Di `dashboard.html` fungsi `copyToClipboard()` sudah memiliki fallback `textarea` untuk konteks non-HTTPS (misalnya saat diakses via IP LAN server lokal `http://192.168.x.x:3005`).
   - Di `tester.html` tombol copy wallet belum memiliki fallback serupa. Standardisasi helper copy ke `public/css/style.css` / shared script.
4. **Dokumentasi Code Example Typo (`docs.html` line 507)**:
   - Pada contoh PHP, header tertulis `"Authorization: *** " . $apiKey`. Harusnya `"Authorization: Bearer " . $apiKey`.

#### B. Kontrak Dual-Render Helper (Desktop Table + Mobile Cards):
Di `dashboard.html`, saat me-render transaksi (`renderTransactionsTable(txs)`), fungsi JavaScript harus me-render:
- Baris tabel `<tr>` ke `#transactionsTableBody` (tampil di desktop).
- Elemen kartu `.mobile-data-card` ke `#transactionsMobileCards` (tampil di mobile).

Contoh pola JavaScript generator untuk mobile card:
```javascript
function createTxMobileCard(tx) {
  const card = document.createElement('div');
  card.className = 'mobile-data-card';
  const statusBadge = tx.status === 'success' 
    ? `<span class="badge badge-success"><span class="badge-dot"></span>Sukses</span>` 
    : `<span class="badge badge-pending"><span class="badge-dot"></span>Pending</span>`;
  const methodBadge = tx.payment_method === 'crypto'
    ? `<span class="badge badge-crypto">Crypto USDT</span>`
    : `<span class="badge badge-success">BCA QRIS</span>`;

  card.innerHTML = `
    <div class="mobile-data-card-header">
      <div>
        <div style="font-weight: 700; color: #fff;">#TX-${tx.id} • ${tx.merchant_name}</div>
        <div class="font-mono" style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 2px;">${tx.external_id}</div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
        ${statusBadge}
        ${methodBadge}
      </div>
    </div>
    <div style="margin: 4px 0;">
      <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600;">Nominal Transaksi</div>
      <div style="font-size: 1.4rem; font-weight: 700; color: #fff; font-family: var(--font-display);">${formatRupiah(tx.amount)}</div>
    </div>
    <div class="mobile-data-card-row" style="font-size: 0.78rem; color: var(--text-muted);">
      <span>Waktu:</span>
      <span>${new Date(tx.created_at + ' UTC').toLocaleString('id-ID')}</span>
    </div>
    <div class="mobile-data-card-actions">
      ${tx.payment_method === 'crypto'
        ? `<a class="btn btn-secondary btn-sm" href="https://etherscan.io/address/${(tx.coinbase_charge_code || '').split(':')[0]}" target="_blank">Etherscan</a>`
        : `<button class="btn btn-primary btn-sm" onclick="viewQrModal('${tx.qris_image}', '${tx.qris_string}', ${tx.amount}, '${tx.external_id}')">Lihat QR</button>`
      }
      ${tx.status === 'pending'
        ? `<button class="btn btn-secondary btn-sm" onclick="simulatePayment(${tx.id})">Simulasi</button>`
        : ''
      }
    </div>
  `;
  return card;
}
```

---
*Spesifikasi ini dirancang oleh `team-ux-ui` sebagai acuan tunggal eksekusi implementasi oleh `team-engineer`.*
