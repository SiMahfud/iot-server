# iot-server — AgyGateway Universal IoT Server 🌐

[![Node.js](https://img.shields.io/badge/Node.js-v18+-68a063?style=flat-square&logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express)](https://expressjs.com)
[![WebSocket](https://img.shields.io/badge/WebSocket-Native%20ws-blue?style=flat-square&logo=websocket)](https://github.com/websockets/ws)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL-003B57?style=flat-square&logo=sqlite)](https://github.com/WiseLibs/better-sqlite3)
[![PWA](https://img.shields.io/badge/Frontend-PWA%20Ready-5A0FC8?style=flat-square&logo=pwa)](https://developer.mozilla.org)
[![Companion](https://img.shields.io/badge/Companion-AgyGatewayClient-orange?style=flat-square)](https://github.com/SiMahfud/AgyGatewayClient)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**iot-server** (AgyGatewayServer) adalah platform gateway IoT modern, mandiri (on-premise / self-hosted), dan berkinerja tinggi yang dirancang sebagai pasangan server resmi dari library C++ mikrokontroler [**AgyGatewayClient**](https://github.com/SiMahfud/AgyGatewayClient).

Server ini menyediakan komunikasi **WebSocket dua arah real-time**, dashboard web interaktif bertema modern berbasis **PWA (Progressive Web App)**, Web Serial API untuk **USB Web Flasher & Serial Monitor** bawaan browser bagi pengguna awam, manajemen komponen pin dinamis, pemindai bus I2C jarak jauh, jadwal otomatis (*cron scheduler*), serta pembaruan firmware jarak jauh (*OTA Updates*) dengan umpan balik progres langsung.

---

## 📑 Daftar Isi

- [Fitur Utama](#-fitur-utama)
- [Arsitektur Sistem](#-arsitektur-sistem)
- [Panduan Instalasi Cepat](#-panduan-instalasi-cepat-5-menit)
- [Menjalankan di Mode Produksi (PM2)](#-menjalankan-di-mode-produksi-pm2)
- [Onboarding Perangkat IoT (Pemula & Mahir)](#-onboarding-perangkat-iot-pemula--mahir)
  - [Jalur A: Pemula (Tanpa Koding / USB Web Flasher)](#jalur-a-pemula-tanpa-koding--usb-web-flasher)
  - [Jalur B: Mahir / Developer (C++ AgyGatewayClient)](#jalur-b-mahir--developer-c-agygatewayclient)
- [Akses Publik Aman via Cloudflare Tunnel](#-akses-publik-aman-via-cloudflare-tunnel)
- [Spesifikasi Protokol WebSocket](#-spesifikasi-protokol-websocket)
- [Referensi REST API](#-referensi-rest-api)
- [Struktur Proyek](#-struktur-proyek)
- [Troubleshooting & FAQ](#-troubleshooting--faq)
- [Lisensi](#-lisensi)

---

## 🌟 Fitur Utama

- ⚡ **Real-Time WebSocket Dua Arah**: Komunikasi latensi ultra-rendah untuk kontrol saklar instan dan transmisi telemetri delta tanpa overhead HTTP berulang.
- 📱 **Progressive Web App (PWA) Dashboard**: Antarmuka responsif dengan desain dark-mode modern, animasi mikro, dan dapat dipasang (*install*) di homescreen Android, iOS, maupun desktop PC.
- 🔌 **USB Web Serial Flasher & Serial Monitor (Zero-Toolchain)**: Pengguna pemula dapat menghubungkan kabel USB mikrokontroler (ESP8266/ESP32) langsung ke browser (Chrome/Edge/Opera), melakukan flashing firmware biner `.bin` tanpa perlu menginstal Python, esptool, atau Arduino IDE, serta membaca log output secara interaktif via Serial Monitor web.
- ☁️ **Cloudflare Tunnel & Reverse Proxy Ready**: Mendukung akses publik aman dari mana saja di seluruh dunia dengan otomatisasi Express `trust proxy` dan deteksi client IP via `CF-Connecting-IP` tanpa perlu port forwarding atau IP publik statis.
- 🔐 **Handshake Autentikasi & Session Token**: Melindungi *Device Secret Key* dari pemaparan berulang. Setelah registrasi pertama, node mikrokontroler berkomunikasi menggunakan token sesi HMAC (`sess_...`).
- 🛠️ **Dynamic Pin Management (Zero-Recompile)**: Tambah saklar relay, tombol input, atau sensor baru langsung dari antarmuka Web tanpa perlu memprogram ulang mikrokontroler.
- 🦾 **Dukungan Aktuator Universal (Servo, RGB LED, Buzzer)**: Kontrol sudut motor servo 0–180° presisi, color picker warna RGB/NeoPixel 24-bit, dan alarm audio buzzer.
- 🧭 **Visualizer 3D Spasial Real-Time (MPU6050 6-Axis)**: Tampilan visual kubus 3D CSS yang berputar mengikuti sudut kemiringan fisik (*Pitch* & *Roll*) sensor MPU6050 beserta tombol kalibrasi nol (*Tare Offset*).
- ⚡ **Mesin Otomasi Cerdas (Smart IF-THEN Rule Engine)**: Eksekutor aturan otomatis berbasis kondisi sensor secara *event-driven* (misal: jika suhu > 30°C maka servo buka jendela dan relay exhaust ON) dilengkapi *cooldown* anti-spam.
- 🔍 **Remote I2C Bus Scanner**: Pindai modul sensor I2C (BMP280, BH1750, SHT30, AHT10, MPU6050, dll.) yang terhubung ke ESP dari jarak jauh melalui klik tombol di dashboard.
- 💡 **Kontrol Dimmer & PWM Slider**: Mendukung pengaturan kecerahan lampu redup, kecepatan kipas exhaust, atau motor DC (0–100%).
- ⏳ **Independent Countdown Timers**: Perintah kontrol dapat menyertakan timer hitung mundur. Timer dijalankan mandiri di chip ESP agar tetap mematikan beban tepat waktu meskipun jaringan terputus.
- ⏰ **Universal Cron Scheduler**: Jadwalkan aksi otomatis berdasarkan waktu (HH:MM) dan hari untuk komponen apa pun termasuk sudut servo dan persentase dimmer. Terintegrasi ke SQLite WAL dan file JSON watcher.
- 🚀 **Remote OTA Updates dengan Live Progress**: Unggah file firmware `.bin` ke server dan kirim instruksi update. Dashboard menampilkan persentase unduhan secara live (0–100%).
- 🎛️ **Virtual Pins Ala Blynk**: Mendukung penulisan dan pembacaan pin virtual (`V1`, `V2`, dst.) untuk otomasi logika kustom.
- 💾 **SQLite WAL Database**: Penyimpanan berkecepatan tinggi dengan Write-Ahead Logging (WAL) untuk mencatat riwayat telemetri, log perangkat, jadwal, dan kredensial admin.

---

## 🏗️ Arsitektur Sistem

```mermaid
flowchart TD
    subgraph HardwareLayer ["Hardware Layer"]
        ESP["ESP8266 / ESP32<br>(Library: AgyGatewayClient)"]
        Sensors["Sensor & Aktuator<br>(Relay, Dimmer, I2C, 1-Wire)"]
        Sensors <--> ESP
    end

    subgraph ServerGateway ["Server Gateway (AgyGatewayServer)"]
        WS["Native WebSocket Server (/ws)"]
        Express["Express.js REST API"]
        Auth["AuthManager (HMAC Session Tokens)"]
        DevMgr["Device & Pin Manager"]
        CompReg["Component Registry"]
        Sched["Cron Scheduler Manager"]
        AutoEng["Smart Rule Engine (IF-THEN)"]
        DB[("SQLite WAL Database<br>iot.db")]
        
        WS <--> Auth
        WS <--> DevMgr
        Express <--> DevMgr
        Express <--> Sched
        Express <--> AutoEng
        DevMgr <--> DB
        DevMgr --> AutoEng
        AutoEng <--> DB
        Sched <--> DB
    end

    subgraph ClientLayer ["Client Layer"]
        Web["PWA Web Dashboard<br>(Browser Smartphone / PC)"]
    end

    ESP <-->|"WebSocket (JSON Delta / auth_ok)"| WS
    Web <-->|"WebSocket (Live Updates)"| WS
    Web <-->|"HTTP / REST API"| Express
```

---

## 🚀 Panduan Instalasi Cepat (5 Menit)

### 1. Prasyarat
Pastikan komputer / server Anda telah terpasang **Node.js** (versi 18 LTS atau lebih baru) dan **npm**:
```bash
node -v
npm -v
```

### 2. Clone Repository & Pasang Dependensi
```bash
git clone https://github.com/SiMahfud/iot-server.git
cd iot-server
npm install
```

### 3. Salin Konfigurasi Default
Salin file konfigurasi contoh `config.example.json` menjadi `config.json`:
```bash
# Windows PowerShell:
Copy-Item config.example.json config.json

# Linux / macOS:
cp config.example.json config.json
```

Edit file `config.json` sesuai kebutuhan:
```json
{
  "server": {
    "port": 3050,
    "wsPath": "/ws"
  },
  "auth": {
    "username": "admin",
    "password": "ganti_dengan_password_admin_anda",
    "deviceSecret": "wemos-secret-key-3377",
    "tokenSecret": "kunci-rahasia-acak-jwt-anda"
  },
  "iot": {
    "deviceTimeoutMs": 45000,
    "pingIntervalMs": 15000
  }
}
```

### 4. Jalankan Server
```bash
npm start
```
Buka browser Anda dan kunjungi: **`http://localhost:3050`**  
*(Login default: Username: `admin`, Password sesuai di `config.json`)*.

---

## 🛡️ Menjalankan di Mode Produksi (PM2)

Agar server IoT berjalan di latar belakang (*background*), otomatis menyala saat komputer boot ulang, dan pulih secara mandiri jika terjadi kegagalan:

1. Pasang **PM2** secara global:
   ```bash
   npm install -g pm2
   ```

2. Jalankan server dengan PM2:
   ```bash
   pm2 start server.js --name "iot-server"
   ```

3. Simpan daftar proses agar otomatis aktif setelah restart komputer:
   ```bash
   pm2 save
   pm2 startup
   ```

4. Perintah berguna lainnya:
   ```bash
   pm2 logs iot-server    # Memantau log real-time
   pm2 restart iot-server # Menjalankan ulang server
   pm2 stop iot-server    # Menghentikan server
   ```

---

## 🔌 Onboarding Perangkat IoT (Pemula & Mahir)

AgyGateway dirancang agar dapat digunakan secara inklusif — baik oleh pengguna awam yang tidak ingin menyentuh baris kode, maupun perekayasa hardware (maker/developer) yang ingin fleksibilitas penuh.

---

### Jalur A: Pemula (Tanpa Koding / USB Web Flasher)

Untuk pengguna pemula, Anda **tidak perlu menginstal Python, Driver esptool, ataupun Arduino IDE**. Cukup gunakan browser web Anda:

1. **Gunakan Browser yang Mendukung**: Buka dashboard di browser berbasis Chromium (Google Chrome, Microsoft Edge, atau Opera versi 89+).
2. **Colok Perangkat**: Sambungkan mikrokontroler ESP8266 (Wemos D1 Mini, NodeMCU) atau ESP32 ke port USB komputer dengan kabel data.
3. **Buka Menu Web Flasher**:
   - Masuk ke tab **Tools** pada dashboard, lalu pilih sub-tab **Web Flasher**.
   - Klik tombol **Hubungkan USB**, browser akan menampilkan jendela pemilihan port COM serial. Pilih board Anda dan klik *Connect*.
4. **Flash Firmware**:
   - Pilih sumber firmware: dari file yang disediakan di server (*Pilih dari Server*) atau unggah file `.bin` Anda sendiri.
   - Atur flash offset (umumnya `0x00000` untuk ESP8266, atau `0x10000` untuk ESP32 app).
   - Klik **Flash Firmware**. Bilah progres dan log terminal web akan menampilkan progres penulisan memori flash secara langsung.
5. **Pantau Koneksi via Serial Monitor Web**:
   - Beralih ke sub-tab **Serial Monitor**, pilih baud rate (misal `115200`), lalu klik **Hubungkan Serial**.
   - Anda dapat melihat log boot mikrokontroler, proses koneksi ke WiFi, dan perolehan alamat IP secara langsung di browser.
6. **Daftarkan di Dashboard**:
   - Klik tombol **+ Tambah IoT** di bagian atas dashboard, masukkan ID Perangkat (misal `esp32-livingroom`), pilih tipe chip, lalu klik **Daftarkan Perangkat**.

---

### Jalur B: Mahir / Developer (C++ AgyGatewayClient)

Bagi pengembang yang memprogram mikrokontroler sendiri, gunakan library resmi [**AgyGatewayClient**](https://github.com/SiMahfud/AgyGatewayClient):

#### 1. Pasang Dependensi (PlatformIO `platformio.ini`)
```ini
[env:esp8266]
platform = espressif8266
board = d1_mini
framework = arduino
monitor_speed = 115200
lib_deps =
    https://github.com/SiMahfud/AgyGatewayClient.git
    bblanchon/ArduinoJson @ ^6.21.3
    links2004/WebSockets @ ^2.4.1
```

#### 2. Contoh Sketch C++ Komprehensif
```cpp
#include <Arduino.h>
#include <AgyGatewayClient.h>

AgyGatewayClient iot;

void setup() {
  Serial.begin(115200);

  // 1. Hardware Watchdog (8 detik) & Status LED
  iot.enableWatchdog(8);
  iot.enableStatusLed(LED_BUILTIN, true);

  // 2. Aktifkan Dynamic Pin Management (Konfigurasi pin via Dashboard Web)
  iot.enableDynamicPins(true);

  // 3. Daftarkan Komponen Bawaan (Opsional)
  // iot.addComponent(id, nama, tipe, pin, access, nilaiAwal)
  iot.addComponent("lampu_utama", "Lampu Utama", "switch", D1, "rw", "false");
  iot.addComponent("exhaust_fan", "Exhaust Fan", "dimmer", D2, "rw", "0");
  iot.addComponent("suhu_kamar",  "Suhu Kamar",  "sensor", -1, "r",  "27.5", "°C");

  // 4. Hubungkan ke Server Gateway
  // Format: begin(SSID, PASSWORD, HOST/IP, PORT, WS_PATH, DEVICE_ID, DEVICE_SECRET)
  // Untuk Cloudflare Tunnel / Domain Publik gunakan port 443 dengan WSS:
  // iot.beginSSL("Nama_WiFi", "Sandi_WiFi", "iot.domainanda.com", 443, "/ws", "node-kamar", "wemos-secret-key-3377");
  iot.begin("Nama_WiFi", "Sandi_WiFi", "192.168.1.100", 3050, "/ws", "node-kamar", "wemos-secret-key-3377");
}

void loop() {
  iot.loop();

  // Kirim data sensor berkala (otomatis delta-checked oleh library)
  static unsigned long lastUpdate = 0;
  if (millis() - lastUpdate > 10000) {
    lastUpdate = millis();
    float suhu = 27.5 + (random(-10, 10) / 10.0);
    iot.updateComponentValue("suhu_kamar", String(suhu, 1));
  }
}
```

---

## ☁️ Akses Publik Aman via Cloudflare Tunnel

Jika Anda ingin mengontrol perangkat IoT dari luar rumah (jaringan seluler 4G/5G atau internet publik) tanpa menyewa VPS mahal, tanpa IP publik statis, dan tanpa membuka celah keamanan port di router:

1. Unduh dan pasang **cloudflared** di komputer server Anda.
2. Buat Cloudflare Tunnel:
   ```bash
   cloudflared tunnel create iot-server-tunnel
   ```
3. Konfigurasikan ingress pada file konfigurasi tunnel (`config.yml`):
   ```yaml
   tunnel: <TUNNEL_UUID>
   credentials-file: /path/to/<TUNNEL_UUID>.json

   ingress:
     - hostname: iot.domainanda.com
       service: http://localhost:3050
     - service: http_status:404
   ```
4. Arahkan DNS di dasbor Cloudflare:
   ```bash
   cloudflared tunnel route dns iot-server-tunnel iot.domainanda.com
   ```
5. Jalankan tunnel:
   ```bash
   cloudflared tunnel run iot-server-tunnel
   ```

Server AgyGateway secara otomatis mendeteksi header `CF-Connecting-IP` dan `X-Forwarded-For` melalui konfigurasi Express `trust proxy`. WebSocket client di dashboard PWA secara cerdas beralih menggunakan koneksi aman `wss://` saat diakses via HTTPS.

---

## 📡 Spesifikasi Protokol WebSocket

### 1. Registrasi Hardware (`Client -> Server`)
Dikirim otomatis oleh node sesaat setelah WebSocket tersambung:
```json
{
  "event": "register",
  "deviceId": "node-kamar",
  "key": "wemos-secret-key-3377",
  "info": {
    "chip": "ESP8266",
    "firmware": "1.2.0",
    "uptime": 24,
    "rssi": -62,
    "dynamicPins": true
  },
  "components": [ ... ]
}
```

### 2. Balasan Handshake Autentikasi (`Server -> Client`)
Server memverifikasi `key` dan membalas dengan token sesi sementara:
```json
{
  "action": "auth_ok",
  "token": "sess_eyJkIjoidGVzdCIsImV4cCI6MTc4OTUyMTYzOH0.signature"
}
```

### 3. Delta Telemetri (`Client -> Server`)
Node mengirimkan perubahan nilai sensor/aktuator hanya dengan menyertakan token sesi:
```json
{
  "event": "telemetry",
  "deviceId": "node-kamar",
  "token": "sess_...",
  "uptime": 125,
  "rssi": -59,
  "delta": true,
  "data": {
    "lampu_tidur": "75",
    "suhu_ruang": "28.4"
  }
}
```

### 4. Kontrol Komponen (`Server -> Client`)
Mengatur saklar, dimmer PWM, atau timer countdown lokal:
```json
{
  "action": "set_component",
  "target": "node-kamar",
  "componentId": "relay_1",
  "value": true,
  "duration": 60
}
```

### 5. Progres OTA Update (`Client -> Server`)
Dilaporkan node setiap kelipatan 10% saat pengunduhan firmware:
```json
{
  "event": "ota_progress",
  "deviceId": "node-kamar",
  "percent": 40,
  "current": 184320,
  "total": 460800
}
```

### 6. Hasil Pemindaian Bus I2C (`Client -> Server`)
```json
{
  "event": "i2c_scan_result",
  "deviceId": "node-kamar",
  "devices": [
    { "address": "0x76", "name": "BMP280 / BME280", "category": "Suhu & Tekanan Udara" }
  ]
}
```

---

## 📋 Referensi REST API

Seluruh endpoint di bawah ini memerlukan header `Authorization: Bearer <TOKEN>` kecuali endpoint `/api/auth/login`.

| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/auth/login` | Login admin, mengembalikan JWT session token. |
| `POST` | `/api/auth/change-password` | Mengubah password admin di SQLite dan config. |
| `GET` | `/api/devices` | Mendapatkan daftar seluruh perangkat yang terdaftar. |
| `POST` | `/api/devices` | Mendaftarkan (*pre-register*) perangkat IoT baru ke server. |
| `DELETE`| `/api/devices/:deviceId` | Menghapus perangkat dari database. |
| `GET` | `/api/firmwares` | Mendapatkan daftar file firmware `.bin` di direktori server untuk OTA. |
| `POST` | `/api/devices/:deviceId/components` | Menambahkan komponen GPIO / I2C baru ke hardware. |
| `DELETE`| `/api/devices/:deviceId/components/:id`| Menghapus komponen dari hardware dan database. |
| `POST` | `/api/devices/:deviceId/components/:id/control` | Mengontrol nilai komponen (Switch / Dimmer / Timer). |
| `GET` | `/api/devices/:deviceId/components/:id/history` | Riwayat grafik telemetri numerik. |
| `POST` | `/api/devices/:deviceId/scan-i2c` | Mengirim instruksi pemindaian bus I2C ke hardware. |
| `GET` | `/api/devices/:deviceId/scan-i2c` | Mengambil hasil scan I2C terakhir. |
| `POST` | `/api/devices/:deviceId/virtual-write` | Menulis data ke Virtual Pin Blynk (`pin`, `value`). |
| `POST` | `/api/devices/:deviceId/ota` | Memulai OTA Update jarak jauh (`firmwareUrl`). |
| `GET` | `/api/schedules` | Mendapatkan daftar jadwal timer/cron aktif. |
| `POST` | `/api/schedules` | Menambahkan jadwal otomatis baru (termasuk nilai target/sudut). |
| `PUT` | `/api/schedules/:id` | Memperbarui jadwal. |
| `DELETE`| `/api/schedules/:id` | Menghapus jadwal. |
| `GET` | `/api/automations` | Mendapatkan daftar aturan otomasi (IF-THEN). |
| `POST` | `/api/automations` | Membuat aturan otomasi cerdas baru. |
| `PUT` | `/api/automations/:id` | Memperbarui aturan otomasi. |
| `DELETE`| `/api/automations/:id` | Menghapus aturan otomasi. |
| `POST` | `/api/automations/:id/test` | Menguji coba pemicuan aturan otomasi secara langsung. |
| `GET` | `/api/component-types` | Katalog definisi modul komponen yang didukung. |
| `GET` | `/api/logs` | Mengambil catatan log aktivitas sistem. |

---

## 📁 Struktur Proyek

```text
AgyGatewayServer/
├── auth.js               # Manajemen autentikasi web & session token hardware
├── automationEngine.js   # Smart Rule Engine IF-THEN (event-driven dari sensor)
├── config.example.json   # Template konfigurasi bersih untuk publikasi git
├── config.json           # Konfigurasi aktif (diabaikan oleh .gitignore)
├── database.js           # Base class SQLite WAL + mixin loader
├── deviceManager.js      # Manajemen state perangkat, soket, dan Dynamic Pins
├── schedulerManager.js   # Eksekutor jadwal otomatis node-cron
├── server.js             # Entrypoint server Express & WebSocket yang ramping
├── db/                   # Modular Database Mixins (Pemisahan Operasi SQLite)
│   ├── migrationMixin.js # Migrasi otomatis dari file JSON lama ke SQLite
│   ├── deviceMixin.js    # Operasi CRUD perangkat dan relay
│   ├── componentMixin.js # Operasi komponen modular dan telemetry history
│   ├── scheduleMixin.js  # Operasi jadwal timer/cron dan sinkronisasi JSON
│   ├── automationMixin.js# Operasi aturan otomatisasi cerdas (IF-THEN)
│   └── userLogMixin.js   # Autentikasi user admin dan pencatatan activity log
├── routes/               # Modular Express REST API Routes
│   ├── auth.js           # Endpoint autentikasi (/api/auth/*)
│   ├── devices.js        # Endpoint perangkat, pin, I2C scan, kontrol (/api/devices/*)
│   ├── schedules.js      # Endpoint jadwal timer/cron (/api/schedules/*)
│   └── automations.js    # Endpoint aturan otomasi, katalog modul, & logs (/api/*)
├── modules/
│   └── componentTypes.js # Katalog definisi modul, metadata, ikon, dan kapabilitas aksi
├── firmwares/            # Direktori penyimpanan file biner firmware OTA (.bin)
│   └── .gitkeep
├── public/               # Frontend Progressive Web App (PWA) Modular
│   ├── index.html        # Single Page Application HTML shell
│   ├── app.js            # Entry point orkestrator aplikasi frontend
│   ├── style.css         # Master barrel stylesheet (@import semua modul CSS)
│   ├── css/              # Modular Stylesheets
│   │   ├── base.css      # CSS Variables, reset, dan utility classes
│   │   ├── login.css     # Layar login, form, dan animasi
│   │   ├── layout.css    # Header, quick stats, device bar, navigasi tab
│   │   ├── components.css# Kartu komponen, switch toggle, timer modal, toast
│   │   ├── pin-manager.css# Modal kelola pin GPIO, I2C scanner, action buttons
│   │   ├── tools.css     # Web Serial Monitor & USB Web Flasher
│   │   ├── misc.css      # Dimmer slider, preset chip, pairing wizard, OTA panel
│   │   ├── widgets.css   # Kartu modul aktuator (Servo, MPU 3D box, RGB, Buzzer)
│   │   └── automations.css# UI Smart Rule Engine IF-THEN
│   ├── js/
│   │   ├── state.js      # Global reactive state & event bus
│   │   ├── wsClient.js   # WebSocket manager & live dispatcher
│   │   └── modules/      # Modul fitur frontend (Factory widgets, automations, scheduler, flasher, chart)
│   ├── manifest.json     # PWA Web App Manifest
│   ├── icon.svg          # Ikon aplikasi vektor
│   └── sw.js             # Service Worker untuk dukungan offline caching
└── .gitignore            # Filter file sensitif, database, dan dependensi
```

---

## ❓ Troubleshooting & FAQ

#### Q: Mengapa mikrokontroler saya ditolak dengan kode status 4003?
**A**: Pastikan nilai `key` yang Anda atur pada `iot.begin()` di sketch mikrokontroler persis sama dengan nilai `auth.deviceSecret` pada file `config.json` di server (default: `wemos-secret-key-3377`).

#### Q: Bagaimana cara mengakses dashboard dari HP di jaringan WiFi yang sama?
**A**: Cari tahu alamat IP komputer server Anda (misal `192.168.1.50` via perintah `ipconfig` di Windows atau `ifconfig` di Linux). Kemudian di browser HP, buka: `http://192.168.1.50:3050`. Anda dapat mengklik menu browser **"Add to Home screen"** untuk menginstalnya sebagai aplikasi PWA.

#### Q: Apakah data perangkat hilang jika server dimatikan?
**A**: Tidak. Seluruh profil perangkat, pemetaan komponen pin dinamis, saklar, dan riwayat telemetri tersimpan aman di database SQLite berkecepatan tinggi (`iot.db`).

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah lisensi **MIT License** — Anda bebas menggunakan, memodifikasi, dan mengintegrasikannya untuk kebutuhan personal maupun komersial.
