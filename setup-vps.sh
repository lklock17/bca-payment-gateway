#!/bin/bash

# BCA Payment Gateway - VPS Setup Script
# Script ini digunakan untuk menginstal Node.js, PM2, dan menjalankan aplikasi di VPS Ubuntu/Debian Anda.

# Warna output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Memulai Setup BCA Payment Gateway di VPS ===${NC}"

# 1. Update sistem
echo -e "\n${BLUE}[1/5] Memperbarui paket sistem...${NC}"
DEBIAN_FRONTEND=noninteractive apt-get update -y && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -o Dpkg::Options::="--force-confold"

# 2. Install Curl dan Node.js (v20.x)
echo -e "\n${BLUE}[2/6] Menginstal Node.js dan npm...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    DEBIAN_FRONTEND=noninteractive apt-get install -y -o Dpkg::Options::="--force-confold" nodejs
    echo -e "${GREEN}Node.js berhasil diinstal: $(node -v)${NC}"
else
    echo -e "${GREEN}Node.js sudah terinstal: $(node -v)${NC}"
fi

# 3. Install Chromium/Puppeteer system dependencies
echo -e "\n${BLUE}[3/6] Menginstal dependensi sistem untuk Puppeteer/Chromium...${NC}"
DEBIAN_FRONTEND=noninteractive apt-get install -y -o Dpkg::Options::="--force-confold" unzip tar libnss3 libnspr4 libatk-1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libgtk-3-0 libasound2 libpangocairo-1.0-0 libpango-1.0-0 libcairo2 ca-certificates fonts-liberation

# 4. Install PM2 (Process Manager) secara global
echo -e "\n${BLUE}[4/6] Menginstal PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    echo -e "${GREEN}PM2 berhasil diinstal.${NC}"
else
    echo -e "${GREEN}PM2 sudah terinstal.${NC}"
fi

# 5. Install dependensi proyek
echo -e "\n${BLUE}[5/6] Menginstal dependensi aplikasi...${NC}"
npm install --production

# 6. Konfigurasi Firewall untuk membuka port 3005
echo -e "\n${BLUE}[6/6] Mengatur firewall...${NC}"
if command -v ufw &> /dev/null; then
    ufw allow 3005/tcp
    echo -e "${GREEN}Port 3005 diizinkan melalui UFW.${NC}"
else
    iptables -I INPUT -p tcp --dport 3005 -j ACCEPT
    echo -e "${GREEN}Port 3005 diizinkan melalui iptables.${NC}"
fi

# 6. Jalankan aplikasi menggunakan PM2
echo -e "\n${BLUE}=== Menjalankan Aplikasi ===${NC}"
pm2 delete "bca-gateway" 2>/dev/null || true
pm2 start server.js --name "bca-gateway"
pm2 save
pm2 startup

echo -e "\n${GREEN}=== SETUP SELESAI ===${NC}"
echo -e "${GREEN}Aplikasi sekarang berjalan di latar belakang VPS!${NC}"
echo -e "Akses Dashboard melalui browser: ${BLUE}http://<IP_VPS_ANDA>:3005${NC}"
echo -e "Gunakan akun default berikut:"
echo -e "  - Email: ${BLUE}admin@gateway.com${NC}"
echo -e "  - Sandi: ${BLUE}admin123${NC}"
