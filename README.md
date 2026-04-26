# LeadPin Desktop

Google Haritalar üzerinden işletme tarayan, Excel/manuel numaralarla listeler oluşturan ve WhatsApp üzerinden toplu/zamanlı/otomatik mesajlar gönderebilen masaüstü uygulaması.

**Teknoloji:** Tauri 2 + Vite + React 19 + TypeScript + Tailwind 4 · Backend: Express + Supabase · Mesajlaşma: whatsapp-web.js

---

## 📥 İndir (son kullanıcı)

**[En son sürümü indir → Releases](../../releases/latest)**

- **Windows:** `LeadPin_*_x64-setup.exe`
- **macOS (M1/M2/M3):** `LeadPin_*_aarch64.dmg`
- **macOS (Intel):** `LeadPin_*_x64.dmg`
- **Linux:** `*.AppImage` (taşınabilir) veya `*.deb` (Ubuntu/Debian)

> macOS'ta imzasız bundle ilk açılışta Gatekeeper'a takılır. Sağ tık → **Aç** → onayla, sonraki açılışlar serbest.

---

## 🚀 Hızlı başlangıç (geliştirici)

### Gereksinimler

- **Node.js** 18+ ([nodejs.org](https://nodejs.org))
- **Rust** + Cargo ([rustup.rs](https://rustup.rs))
- **Platforma özel build araçları:**
  - **Windows:** Visual Studio Build Tools — "Desktop development with C++" workload
  - **macOS:** Xcode Command Line Tools — `xcode-select --install`
  - **Linux:** `webkit2gtk-4.1`, `libssl-dev`, `libgtk-3-dev` (Ubuntu/Debian)
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
```bash
cd backend
npm run dev
```

**Terminal 2 — Tauri + Frontend:**

macOS / Linux:
```bash
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri:dev
```

Windows (PowerShell):
```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run tauri:dev
```

### Production Build

**Windows:**
```powershell
.\build.ps1
```
Çıktı: `src-tauri/target/release/bundle/nsis/LeadPin_<versiyon>_x64-setup.exe`

**macOS:**
```bash
chmod +x build.sh
./build.sh
```
Çıktı: `src-tauri/target/release/bundle/dmg/LeadPin_<versiyon>_<arch>.dmg`
- Apple Silicon (M1/M2/M3) Mac'te otomatik `aarch64-apple-darwin` build
- Intel Mac'te otomatik `x86_64-apple-darwin` build
- Universal binary ister misin? Önce `aarch64`'te bir kez, sonra `x86_64`'te tekrar build edip `lipo` ile birleştir.

**Linux:**
```bash
chmod +x build.sh
./build.sh
```
Çıktı: `src-tauri/target/release/bundle/deb/*.deb` ve `bundle/appimage/*.AppImage`

> **Not:** Build script'i hangi OS'ta çalıştırıldıysa o OS için artefakt üretir.
> Cross-compile (Mac'te Windows binary üretmek vs.) Tauri ile resmi olarak desteklenmez —
> her platform için ayrı bir build makinesi (veya GitHub Actions matrix) gerekir.

### GitHub Actions ile otomatik release (önerilen)

[`.github/workflows/release.yml`](.github/workflows/release.yml) — tag push'ta veya manuel
tetiklenince **4 platform için paralel build** çalışır ve hepsi GitHub Releases'a yüklenir:
- `LeadPin_*.exe` (Windows NSIS installer)
- `LeadPin_*_aarch64.dmg` (Mac Apple Silicon)
- `LeadPin_*_x64.dmg` (Mac Intel)
- `*.deb` + `*.AppImage` (Linux)

**İlk kurulum:**

1. Repository → Settings → Secrets and variables → Actions → bu üç secret'ı ekle:
   ```
   SUPABASE_URL                = https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY   = eyJ...
   SUPABASE_ACCESS_TOKEN       = sbp_...
   ```

2. Yeni release çıkarmak için:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
   ~10 dakika sonra Actions sekmesinde 4 build paralel biter, GitHub Releases altında
   draft release oluşur (sen yayınla butonuna basana kadar gizli).

3. **Manuel test build** (tag oluşturmadan): Actions sekmesi → "Release" workflow → "Run workflow"
   → tag adı yaz → çalıştır.

**Mac imzalama (opsiyonel, Gatekeeper temiz dağıtım için):**
- Apple Developer hesabı ($99/yıl) → "Developer ID Application" sertifikası al
- Sertifikayı `.p12` olarak export et, base64'e çevir, secret'a ekle:
  - `APPLE_CERTIFICATE` (base64 .p12)
  - `APPLE_CERTIFICATE_PASSWORD`
  - `APPLE_SIGNING_IDENTITY` (örn. "Developer ID Application: Adın Soyadın")
  - `APPLE_ID`, `APPLE_PASSWORD` (App-Specific Password), `APPLE_TEAM_ID`
- `tauri-action` bu env'leri otomatik algılayıp imzalar + notarize eder

**Maliyet:** GitHub Actions runner saatleri public repo'da ücretsiz. Private repo'da
ayda ~2000 dakika ücretsiz; bir release ~30 dk runner kullanır → ayda 60+ release atabilirsin.

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

### Plan / Abonelik / Token Yönetimi (admin için)

Uygulama 3 plan kullanır + admin:

| Plan | Aylık tarama | Aylık manuel/toplu mesaj | Saklı lead | Fiyat |
|------|--------------|--------------------------|------------|-------|
| Free | 250 | 100 | 500 | $0 |
| Pro | 1.500 | 1.000 | 500 | $10 |
| Sınırsız | 10.000 | 5.000 | 500 | $20 |
| Admin | sınırsız | sınırsız | sınırsız | — |

**Akış:** Müşteri sitede ödeme yapar → admin Supabase'de token üretir → müşteri uygulamada Ayarlar → Plan sekmesinden token girer → plan aktifleşir.

#### 1. Kendi hesabını admin yap

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('is_admin', true)
where email = 'sizin@email.com';
```

Admin hesabında tüm limitler bypass edilir, hiçbir token girmesine gerek yok.

#### 2. Tek aktivasyon kodu üret (Pro, 30 gün)

```sql
-- Token formatı: LP-<PLAN>-<12 karakter>
insert into public.subscription_tokens (token, plan_id, duration_days, note)
values (
  'LP-PRO-' || upper(substring(md5(random()::text), 1, 12)),
  'pro',
  30,
  'Müşteri: Ahmet Yılmaz - Sipariş #123'
)
returning token;
-- Çıktıdaki "token" değerini müşteriye yolla.
```

#### 3. Toplu kod üret (10 adet Pro)

```sql
insert into public.subscription_tokens (token, plan_id, duration_days, note)
select
  'LP-PRO-' || upper(substring(md5(random()::text || gs::text), 1, 12)),
  'pro',
  30,
  'Toplu üretim ' || now()::date
from generate_series(1, 10) gs
returning token;
```

#### 4. Token'ı iptal et (kullanılmamış olmalı)

```sql
update public.subscription_tokens
set status = 'cancelled'
where token = 'LP-PRO-XXXXXXXXXXXX' and status = 'unredeemed';
```

#### 5. Mevcut aboneliği kontrol et

```sql
select s.plan_id, s.scrape_used, s.message_used,
       s.current_period_end, u.email
from public.subscriptions s
join auth.users u on u.id = s.user_id
order by s.updated_at desc;
```

#### 6. Token kullanım raporu

```sql
select t.token, t.plan_id, t.status, t.created_at, t.redeemed_at, u.email
from public.subscription_tokens t
left join auth.users u on u.id = t.redeemed_by
order by t.created_at desc
limit 50;
```

> **`unlimited` plan için kod üretmek istersen** `'LP-PRO-'` yerine `'LP-UNL-'` ve `'pro'` yerine `'unlimited'` kullan.

---

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

### macOS: "App can't be opened because Apple cannot check it for malicious software"
İmzasız .dmg ilk açılışta Gatekeeper tarafından engellenir. Çözüm:
- Uygulamayı Finder'da bulun, **sağ tık → Aç** → onay penceresinde tekrar **Aç**
- Veya terminal: `sudo xattr -d com.apple.quarantine /Applications/LeadPin.app`
- Kalıcı çözüm: Apple Developer ID ile imzalama + notarization (production dağıtımda gerekli)

### macOS: Sidecar permission denied
`build.sh` chmod +x yapıyor ama eski binary kalmışsa:
```bash
chmod +x src-tauri/binaries/backend-*
```

### Linux: webkit2gtk eksik
Ubuntu 22.04+ için: `sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0`. Eski sürümlerde `webkit2gtk-4.0` paketi gerekebilir.

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
