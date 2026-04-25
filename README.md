# LeadPin Desktop

Google Haritalar üzerinden işletme tarayan, Excel/manuel numaralarla listeler oluşturan ve WhatsApp üzerinden toplu/zamanlı/otomatik mesajlar gönderebilen masaüstü uygulaması.

**Teknoloji:** Tauri 2 + Vite + React 19 + TypeScript + Tailwind 4 · Backend: Express + Supabase · Mesajlaşma: whatsapp-web.js

---

## 🚀 Hızlı başlangıç

### Gereksinimler

- **Node.js** 18+ ([nodejs.org](https://nodejs.org))
- **Rust** + Cargo ([rustup.rs](https://rustup.rs))
- **Visual Studio Build Tools** (Windows, "Desktop development with C++" workload)
- **Supabase projesi** (kendi ücretsiz hesabın yeterli)

### Kurulum

```powershell
# 1. Bağımlılıkları yükle
npm install
cd backend
npm install
cd ..

# 2. Backend için credentials
copy backend\.env.example backend\.env
# .env'yi düzenle, Supabase credentials'larını ekle

# 3. Supabase migrations'ları çalıştır (aşağıdaki SQL bölümüne bak)
```

### Çalıştırma (Dev)

İki ayrı terminal aç:

**Terminal 1 — Backend (sidecar):**
```powershell
cd backend
npm run dev
```

**Terminal 2 — Tauri + Frontend:**
```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run tauri:dev
```

### Production Build

```powershell
.\build.ps1
```

Çıktı: `src-tauri/target/release/bundle/nsis/LeadPin_<versiyon>_x64-setup.exe`

---

## 📁 Klasör yapısı

```
desktop/
├── src/                          # React frontend
│   ├── components/
│   │   ├── business/             # İşletme detay sayfası bileşenleri
│   │   ├── dashboard/            # Dashboard + WhatsApp panelleri
│   │   │   └── whatsapp/         # Toplu mesaj, oto-cevap, şablonlar...
│   │   └── ui/                   # Generic UI primitives
│   ├── hooks/
│   ├── lib/
│   ├── pages/
│   └── App.tsx
├── src-tauri/                    # Tauri Rust + config
│   ├── src/
│   │   ├── lib.rs                # Sidecar başlatıcı
│   │   └── main.rs
│   ├── icons/                    # Uygulama ikonları
│   ├── binaries/                 # Sidecar exe (build sonrası)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── build.rs
├── backend/                      # Express sidecar
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── index.ts
│   ├── migrations/               # Supabase SQL şemaları
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── public/                       # Static assets
├── package.json
├── vite.config.ts
├── tsconfig.json
├── build.ps1                     # Build automation script
└── README.md
```

---

## ⚙️ Backend `.env` yapılandırması

`backend/.env` dosyasını oluştururken `.env.example`'dan kopyala ve düzenle:

```env
PORT=4000
NODE_ENV=development

# Supabase (zorunlu)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # service_role key, anon DEĞİL
SUPABASE_ACCESS_TOKEN=sbp_...

# Puppeteer
PUPPETEER_HEADLESS=true               # false = tarama görünür açılır

# Short link (opsiyonel — sadece "link_owner" hesaplar için)
# SHORT_LINK_PUBLIC_URL=https://sizinsiteniz.com
# SHORT_LINK_REDIRECT_URL=https://sizinsiteniz.com

# WhatsApp Termux proxy (opsiyonel)
# WHATSAPP_PROXY_HOST=192.168.43.1
# WHATSAPP_PROXY_PORT=8080
```

---

## 🗄️ Supabase Şeması

İlk kurulumda Supabase SQL Editor'da **tek dosyayı** çalıştır:

```
backend/schema.sql
```

İçinde tüm tablolar, RLS politikaları, indexler ve `track_short_id_click` RPC fonksiyonu var. `IF NOT EXISTS` ile yazıldığı için tekrar çalıştırmak güvenlidir; mevcut veriyi bozmaz.

### Son adım: kendine `link_owner` yetkisi ver

`schema.sql` dosyasının en sonunda yorum içinde duran SQL bloğunu kendi e-postanla değiştirip çalıştır:

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('link_owner', true)
where email = 'sizin@email.com';
```

Bu, short link (`{link}` değişkeni) özelliğini sadece senin hesabında açar.

---

## 🎯 Özellikler

### 📊 Lead Yönetimi
- Google Haritalar üzerinden işletme tarama (kategori + şehir + ilçe + mahalle)
- Filtreleme: puan, yorum sayısı, web sitesi, telefon
- Excel/CSV export
- Liste oluşturup gruplandırma

### 📥 Manuel/Excel İmport
- Telefon numaralarını yapıştır veya Excel ile yükle
- Otomatik format normalizasyonu (905XXXXXXXXX)
- Duplicate önleme

### 💬 WhatsApp Merkezi (7 sekme)
1. **Toplu Mesaj** — Şablon + spintax + medya + zamanlama desteği
2. **Oto-Cevap** — Anahtar kelime kuralları, cooldown, "kişi başına 1 cevap" kilidi
3. **Şablonlar** — Tüm panellerde paylaşılan yeniden kullanılabilir mesajlar
4. **Karşılama** — İlk yazana otomatik hoşgeldin mesajı
5. **Zamanlı** — İleri tarihli kampanya kuyruğu
6. **Geçmiş** — Tıklama analitiği + son tıklama + dönüşüm oranı
7. **Hatlar** — Birden fazla WhatsApp numarası, QR ile bağlama

### 🔗 Short Link Tıklama Takibi
Her işletmeye özel `domain.com/abc1` linki üretir, tıklamaları sayar.

> Bu özellik `link_owner` bayrağı olan hesaplara açıktır. Backend'inin `/api/user-settings` üzerinden domain'ini ayarlaman gerekir.

---

## 📦 Build Pipeline

`build.ps1` 4 aşama:

1. **Backend TypeScript derleme** — `backend/dist/`
2. **Sidecar exe paketleme** — `@yao-pkg/pkg` ile `src-tauri/binaries/backend-x86_64-pc-windows-msvc.exe`
3. **Frontend Vite build** — `dist/`
4. **Tauri bundle** — `src-tauri/target/release/bundle/nsis/*.exe`

Manuel adım adım:
```powershell
cd backend
npm run build
npx @yao-pkg/pkg dist/index.js --targets node18-win-x64 --output ../src-tauri/binaries/backend-x86_64-pc-windows-msvc

cd ..
npm run build
npm run tauri:build
```

---

## 🐛 Yaygın sorunlar

### "cargo metadata not found"
Cargo PATH'te değil. PowerShell'de:
```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
```

### "linker link.exe not found"
Visual Studio Build Tools yüklü değil. [Buradan](https://visualstudio.microsoft.com/visual-cpp-build-tools/) "Desktop development with C++" workload'unu yükle.

### "binaries/backend-*.exe doesn't exist"
İlk dev başlatmada gerekmez (Tauri config dev modunda externalBin atlar). Production build için `build.ps1` çalıştır.

### "icons/icon.ico not found"
İkonlar dahil ama varsayılan PNG'den ICO üretmek gerekirse:
```powershell
npx @tauri-apps/cli icon path/to/logo.png
```

### Backend "Connection closed" / Puppeteer crash
- `.env`'de `PUPPETEER_HEADLESS=true` mu?
- `backend/.cache/` veya `.wwebjs_auth/` bozulmuş olabilir, sil ve yeniden başlat.

### WhatsApp QR sürekli yenileniyor
Hat ekledikten sonra 30 saniye içinde tara. Yenileniyorsa `Hatlar → 🔄 Yeniden bağlan` kullan.

---

## 🔐 Güvenlik notları

- `backend/.env` **asla commit etme** (`.gitignore` zaten dışlıyor)
- `SUPABASE_SERVICE_ROLE_KEY` admin yetkisidir; sadece backend'de kullanılmalı
- `link_owner` flag'i Supabase Dashboard → Auth → User metadata üzerinden manuel set edilir; kullanıcı kendi vermez
- WhatsApp oturum dosyaları (`backend/.wwebjs_auth/`) telefonun WhatsApp credentials'ını içerir, **paylaşma**

---

## 🤝 Mimari notları

```
┌─────────────────────────────────────────────────────────┐
│  Tauri Desktop (Windows app)                            │
│                                                          │
│  ┌──────────────────┐     ┌────────────────────────┐   │
│  │  React Frontend  │     │  Backend (sidecar exe) │   │
│  │  (Vite + Tailwind)│◄───►│  Express + Puppeteer   │   │
│  │                   │     │  whatsapp-web.js       │   │
│  └──────────────────┘     └────────┬───────────────┘   │
│                                      │                   │
└──────────────────────────────────────┼───────────────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │   Supabase (cloud)   │
                            │   - auth.users       │
                            │   - businesses       │
                            │   - lists            │
                            │   - whatsapp_*       │
                            │   - user_settings    │
                            └──────────┬───────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │  ugra.io (web)       │
                            │  Tıklama takibi      │
                            └──────────────────────┘
```

- **Sidecar pattern:** Backend `src-tauri/binaries/backend-*.exe` olarak Tauri içine gömülür, app açılınca otomatik başlar (`localhost:4000`).
- **Veri tek noktada:** Tüm veri Supabase'de; lokal SQLite yok. Birden fazla cihazdan aynı veriye erişim.
- **Tıklama takibi:** Mesajdaki `{link}` → `domain.com/abc1` → ugra.io React app `/:shortId` route'u → Supabase RPC `track_short_id_click`.

---

## 📝 Lisans

Proprietary. Bu yazılım LeadPin / Ugra projesinin parçasıdır.
