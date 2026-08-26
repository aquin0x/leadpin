# LeadPin — VPS (Coolify) Deploy Tasarımı

**Tarih:** 2026-08-26
**Durum:** Onaylandı, uygulanmayı bekliyor
**Kapsam:** Adım A — uygulamayı container'a alıp Coolify'a deploy etmek

---

## 1. Bağlam ve yol haritası

LeadPin bugün bir Windows masaüstü uygulaması: Tauri 2 kabuğu içinde React SPA, yanında
`pkg` ile exe'ye paketlenmiş bir Express backend (sidecar) çalışıyor. Backend Puppeteer ile
Google Maps taraması, whatsapp-web.js ile WhatsApp gönderimi yapıyor. Tek veri deposu
bulut Supabase.

Hedef: aynı sistemi VPS'te 7/24 çalışır hale getirmek, sonra Supabase bağımlılığını kaldırmak.

İş üç adıma bölündü. Bu belge **yalnızca A adımını** tanımlar.

| Adım | İş | Durum |
|------|-----|-------|
| **A** | Container'a al, Coolify'a deploy et — bulut Supabase'e bağlı kalarak | **bu belge** |
| B | Veri katmanını Supabase → self-hosted Postgres'e çevir (auth + storage dahil) | ayrı spec |
| C | Eksik WhatsApp otomasyon endpoint'leri (auto-reply, karşılama, şablon, zamanlanmış) | ayrı spec |

**Bu sıranın gerekçesi:** A bittiğinde uygulamanın VPS'te çalıştığı görülür ve
Chromium / WhatsApp oturumu / kalıcı disk tarafı kanıtlanmış olur. B ardından, çalıştığı
bilinen bir kurulumun üstüne saf bir kod değişikliği olarak gelir. İkisi aynı anda
yapılırsa bir şey bozulduğunda "container mı, yeni SQL mi?" ayrımı yapılamaz.
Veri sıfırdan başlayacağı için A sırasında bulut Supabase'i kullanmanın maliyeti yok.

### Hedef ortam (doğrulandı)

- Coolify **v4.1.2**, tek sunucu (`localhost`), Ubuntu, 24 GB RAM / 4 vCPU
- Proje: `aqu-vps` / environment `production`
- Merkezi Postgres `postgres:18-alpine` çalışıyor ve sağlıklı — **A'da kullanılmıyor**, B için hazır
- `sslip.io` + Let's Encrypt bu sunucuda halihazırda çalışıyor (`fraxlabs-web`, `millitavir-web`)
- Kaynak repo: GitHub `aquin0x/leadpin`, branch `main`

### A'nın kapsamı dışında (bilinçli)

- Supabase'in kaldırılması (B)
- Eksik otomasyon endpoint'leri (C)
- `_lines.json`'ın veritabanına taşınması — tek kullanıcı için gerekmiyor, bkz. §8
- Yatay ölçekleme / çoklu replica — §8'deki kısıt nedeniyle mümkün değil, ihtiyaç da yok

---

## 2. Mimari

### 2.1 Seçilen yaklaşım: tek container, Express hem API'yi hem paneli servis eder

```
┌──────────────────── Coolify (Traefik) ────────────────────┐
│  https://leadpin.92-5-1-12.sslip.io                       │
└───────────────────────────┬───────────────────────────────┘
                            │
                ┌───────────▼────────────┐
                │  leadpin container     │
                │  Express :4000         │
                │   ├─ GET  /            → SPA (dist/)      │
                │   ├─ GET  /health                         │
                │   ├─ GET  /r/:shortId  → short-link       │
                │   └─ /api/*            → REST             │
                │  + Chromium (puppeteer-managed)           │
                └───────────┬────────────┘
                            │ volume
                   ┌────────▼─────────┐        ┌──────────────┐
                   │ /data            │        │ Supabase     │
                   │  .wwebjs_auth/   │        │ (bulut, A'da │
                   │  _lines.json     │        │  değişmiyor) │
                   └──────────────────┘        └──────────────┘
```

**Neden tek container (değerlendirilen alternatifler):**

| Yaklaşım | Karar |
|---|---|
| **A. Tek container, Express SPA'yı da servis eder** | **Seçildi.** Panel ve API aynı origin → CORS tamamen ortadan kalkar. Coolify'da tek kaynak, tek port, tek volume, tek deploy. Tek kullanıcı için doğru ölçek. |
| B. İki ayrı Coolify kaynağı (static site + API) | Elendi. İki origin → CORS şart; IP/sslip.io ile çalışırken çerez ve mixed-content ayarları gereksiz uğraş. Ölçeklenmeyecek bir tek-kullanıcı kurulumu için bedava karmaşıklık. |
| C. Coolify içinde docker-compose + Traefik path routing | Elendi. A ile aynı sonucu verir ama Traefik label'ları elle yazıldığı için daha kırılgan. |

**Bedeli:** frontend'de tek satır değişse bile imaj yeniden build edilir. Tek kullanıcı için önemsiz.

### 2.2 Dockerfile — üç aşama

Repo kökünde `Dockerfile`:

| Aşama | Taban | Yaptığı |
|---|---|---|
| `frontend-build` | `node:22-bookworm` | `npm ci` → `npm run build` → `/dist` |
| `backend-build` | `node:22-bookworm` | `backend/npm ci` → `npm run build` → `backend/dist` |
| `runtime` | `node:22-bookworm-slim` | Chromium sistem kütüphaneleri + prod bağımlılıklar + iki aşamanın çıktısı |

Runtime aşamasının kritik detayları:

- **`tini` PID 1 olarak.** Puppeteer'ın açtığı Chromium süreçleri bir init süreci olmadan
  zombi bırakır ve container zamanla process tablosunu doldurur. Bu, Docker'da Puppeteer'ın
  en yaygın tuzağı. `tini` imaja kurulur ve `ENTRYPOINT ["/usr/bin/tini", "--"]` yapılır.
  (Alternatif: Coolify'ın "Custom Docker Options" alanına `--init` yazmak. İmaja gömmeyi
  tercih ediyoruz — Coolify yapılandırmasına bağımlı olmasın.)
- **Non-root çalışma:** `USER node`. `/data` bu kullanıcıya yazılabilir olmalı.
- **Chromium:** imaj build'inde `npx puppeteer browsers install chrome` ile kurulur,
  `PUPPETEER_CACHE_DIR=/opt/puppeteer` altına. Debian'ın `chromium` paketi
  **kullanılmayacak** — whatsapp-web.js sürüm uyumu konusunda seçici, puppeteer'ın
  kendi indirdiği Chrome sürüm-eşli gelir.
- **Backend prod bağımlılıkları:** `npm ci --omit=dev`, `PUPPETEER_SKIP_DOWNLOAD=true`
  (Chrome ayrı adımda kuruluyor, iki kez inmesin).
- Gereken apt paketleri: `ca-certificates fonts-liberation fonts-noto-color-emoji
  libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2
  libgbm1 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcomposite1 libxdamage1
  libxext6 libxfixes3 libxkbcommon0 libxrandr2 tini`
- `EXPOSE 4000`, `HEALTHCHECK` → `GET /health`

Ayrıca `.dockerignore` eklenecek: `node_modules`, `backend/node_modules`, `dist`,
`backend/dist`, `src-tauri/target`, `src-tauri/binaries`, `backend/.wwebjs_auth`,
`backend/.wwebjs_cache`, `backend/.cache`, `.git`, `*.env`.

### 2.3 Kalıcı durum

Tek kalıcı dizin: **`/data`** (Coolify volume `leadpin-data`).

| İçerik | Yol | Neden kalıcı olmalı |
|---|---|---|
| WhatsApp oturumları | `/data/.wwebjs_auth/session-<lineId>/` | Olmazsa **her deploy'da QR okutmak gerekir** |
| Hat listesi | `/data/.wwebjs_auth/_lines.json` | Hangi kullanıcının hangi hattı olduğunun tek kaydı |

`APP_DATA_DIR=/data` env'i ile bağlanır — bu mekanizma kodda zaten var
(`backend/src/services/whatsapp.ts:69`), Tauri'nin masaüstünde kullandığı yolun aynısı.
Açılışta `bootstrapLines()` (`backend/src/index.ts:323`) kayıtlı tüm hatları otomatik
ayağa kaldırır, yani container restart'ından sonra hatlar kendiliğinden `ready`'ye döner.

---

## 3. Coolify yapılandırması

### 3.1 Kaynak

| Ayar | Değer |
|---|---|
| Tip | Application → Dockerfile |
| Kaynak | GitHub `aquin0x/leadpin`, branch `main` |
| Proje / env | `aqu-vps` / `production` |
| Port | `4000` |
| Healthcheck | `GET /health` |
| Persistent storage | `leadpin-data` → `/data` |
| Bellek limiti | 4 GB |
| Domain | Önce `http://92.5.1.12:<port>`, ardından `https://leadpin.92-5-1-12.sslip.io` |

### 3.2 Ortam değişkenleri

**Runtime değişkenleri:**

| Değişken | Değer | Not |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `4000` | |
| `TZ` | `Europe/Istanbul` | C adımındaki zamanlanmış kampanyalar buna dayanacak |
| `APP_DATA_DIR` | `/data` | WhatsApp oturum kökü |
| `PUPPETEER_EXECUTABLE_PATH` | **Dockerfile'da `ENV` ile gömülür, Coolify'da tanımlanmaz** | Yol, kurulan Chrome sürümüne bağlı (`/opt/puppeteer/chrome/linux-<sürüm>/chrome-linux64/chrome`). Build sırasında `npx puppeteer browsers install chrome` çıktısından çözülüp imaja yazılır ki sürüm yükseldiğinde elle güncelleme gerekmesin. §4 madde 4 ile birlikte çalışır |
| `PUBLIC_BASE_URL` | uygulamanın dış URL'i | short-link'lerin üretiminde kullanılır |
| `ALLOWED_ORIGINS` | dış URL (virgülle çoklu) | §4 madde 2 |
| `SUPABASE_URL` | mevcut bulut değeri | A'da değişmiyor |
| `SUPABASE_SERVICE_ROLE_KEY` | mevcut bulut değeri | **gizli**, sadece Coolify'da |
| `SHORT_LINK_REDIRECT_URL` | mevcut değer | kullanıcı ayarı yoksa yedek |

**Build değişkenleri** (Coolify'da "Build Variable" işaretli olmalı):

| Değişken | Değer |
|---|---|
| `VITE_SUPABASE_URL` | mevcut bulut değeri |
| `VITE_SUPABASE_ANON_KEY` | mevcut bulut değeri |
| `VITE_API_URL` | `/` |

> **Tuzak — bu atlanırsa deploy sessizce bozulur.** Vite `VITE_*` değişkenlerini
> **build anında** bundle'a gömer. Bunlar normal runtime env olarak tanımlanırsa
> frontend boş anahtarlarla derlenir, `src/lib/supabase.ts:7` açılışta exception
> fırlatır ve panel beyaz ekran verir. Hata mesajı da build log'unda değil tarayıcı
> konsolunda çıkar, yani teşhisi zordur.

`VITE_API_URL=/` seçiminin sebebi: `api-client.ts:31` sondaki `/`'ı kırptığı için
istekler `/api/...` biçiminde relative üretilir — aynı origin, CORS yok. Kodda
değişiklik gerekmez. (Tek istisna `useScrapeJob.ts`, bkz. §4 madde 6.)

### 3.3 Erişim ve TLS

Başlangıçta `http://92.5.1.12:<port>`. Doğrulama listesi geçtikten sonra Coolify'dan
`leadpin.92-5-1-12.sslip.io` domain'i tanımlanıp Let's Encrypt sertifikası alınır.
Bu desen bu sunucuda `fraxlabs-web` ve `millitavir-web` üzerinde zaten çalışıyor.

TLS **B adımından önce** açılmalı: aksi halde Supabase JWT'si düz metin gider.

---

## 4. Gereken kod değişiklikleri

Hepsi hedefli, toplam ~150 satır. Mimari değişiklik yok.

| # | Dosya | Değişiklik | Gerekçe |
|---|---|---|---|
| 1 | `backend/src/index.ts` | SPA servisi: `express.static(PUBLIC_DIR)` + React Router fallback | Tek container, tek origin |
| 2 | `backend/src/index.ts:27-51` | CORS listesi `ALLOWED_ORIGINS` env'inden okunacak; Tauri origin'leri varsayılan olarak kalacak | Şu an sadece `localhost:5173` ve `tauri://localhost` kabul ediliyor |
| 3 | `backend/src/index.ts:56` | Global error handler route'ların **altına** taşınacak | Şu an route'lardan önce olduğu için hiç tetiklenmiyor — ölü kod |
| 4 | `backend/src/services/whatsapp.ts:167` | `executablePath: process.env.PUPPETEER_EXECUTABLE_PATH \|\| undefined` eklenecek | Scraper bu env'i okuyor (`scraper.ts:161`), WhatsApp okumuyor. Linux'ta tam olarak burada patlar |
| 5 | `backend/src/index.ts` | SIGTERM/SIGINT handler | §5 |
| 6 | `src/hooks/useScrapeJob.ts:14` | `api-client` ile aynı URL normalizasyonu kullanılacak | `API_URL="/"` iken `${API_URL}/api/...` → `//api/...` (protocol-relative URL) üretir ve kırılır |
| 7 | `backend/src/index.ts:91` | `/r/:shortId` kullanıcının `user_settings.short_link_redirect_url` değerini okuyacak, yoksa env'e düşecek | Kolon var ama okunmuyor; bu özellik ancak VPS'te gerçekten çalışabilir hale geliyor |
| 8 | `.dockerignore` | yeni dosya | §2.2 |

### 4.1 Madde 1 için uyarı: Express 5 wildcard

Proje Express **5** kullanıyor (`backend/package.json`), o da `path-to-regexp` v8'e
dayanıyor. Express 4'teki `app.get('*', ...)` kalıbı Express 5'te **hata fırlatır**.
SPA fallback bu yüzden RegExp ile yazılacak — `/api`, `/health` ve `/r/` ile başlayan
yollar hariç tutulup kalan her GET isteği `index.html`'e yönlendirilecek.

`PUBLIC_DIR` yoksa (masaüstü sidecar modu) static middleware hiç eklenmeyecek.

---

## 5. Graceful shutdown

Coolify her deploy'da container'a SIGTERM gönderir. Bugünkü davranışta bu şu zararı verir:

Kampanya başlarken mesaj kotası **peşin** düşülüyor
(`backend/src/controllers/whatsapp.controller.ts:97` — liste boyutu kadar).
İade yalnızca kampanya normal biterse yapılıyor
(`backend/src/services/whatsapp.ts:740`). Süreç ortadan kaybolursa iade hiç çalışmaz.
Masaüstünde bu nadir bir durum; VPS'te **her deploy'da** olur.

Eklenecek handler sırasıyla:

1. Yeni bağlantıları kes (`server.close()`)
2. Çalışan kampanya varsa `stopCampaign()` çağır ve işlenmemiş mesajların kotasını
   `refundMessages()` ile iade et
3. Tüm WhatsApp client'larını `destroy()` ile kapat (Chromium süreçleri temiz kapansın,
   `SingletonLock` kalmasın)
4. Süreçten çık

Zaman sınırı: 15 saniye. Aşılırsa zorla çıkılır — Coolify'ın kendi timeout'undan önce
bitmeli, aksi halde `SIGKILL` gelir ve adım 2 yarım kalır.

> Not: `initLine()` içinde `SingletonLock` artıklarını temizleyen kurtarma kodu zaten var
> (`backend/src/services/whatsapp.ts:266-283`). Yani ani kapanma felaket değil; ama kota
> iadesi o kodun kapsamında değil, bu yüzden handler gerekli.

---

## 6. Masaüstü sürümünün korunması

Masaüstü build'i bozulmadan kalacak. Hiçbir Tauri dosyasına dokunulmuyor
(`src-tauri/`, `build.ps1`, `build.sh`, `.github/workflows/release.yml`).

Uyumluluk üç noktadan geliyor:

| Nokta | Masaüstü | VPS |
|---|---|---|
| CORS | `tauri://localhost`, `http://tauri.localhost` — varsayılan listede kalır | `ALLOWED_ORIGINS` env'i |
| Veri dizini | Tauri `APP_DATA_DIR`'i verir (`src-tauri/src/lib.rs:32`) | Coolify env'i `/data` verir |
| API adresi | `.env` → `VITE_API_URL=http://127.0.0.1:4000` | build var → `VITE_API_URL=/` |
| SPA servisi | `PUBLIC_DIR` yok → static middleware eklenmez | `PUBLIC_DIR` var → eklenir |

Frontend'de zaten **tek bir `@tauri-apps` importu yok** — saf web SPA olduğu için iki
ortamda da aynı kod çalışır.

**Bilinen sınırlama (kabul edildi):** Aynı kullanıcı hem masaüstünü hem VPS'i kullanırsa
iki ayrı `_lines.json` ve iki ayrı WhatsApp oturum seti oluşur; ikisi birbirinden habersizdir.
İkisinde aynı anda kampanya başlatılırsa kota iki kez düşer. Tek kullanıcı senaryosunda
pratikte sorun değil; kullanım şekli "ya masaüstü ya VPS" olmalı.

---

## 7. Güvenlik

| Konu | Yapılacak |
|---|---|
| **Kayıt açık** | `src/pages/AuthPage.tsx:51` `signUp` çağırıyor ve panel herkese açık bir adreste olacak. Supabase panelinden yeni kullanıcı kaydı kapatılacak. |
| **Service role key** | Bugün `backend/.env` Tauri bundle'ına resource olarak gömülüyor (`src-tauri/tauri.conf.json:38`) — kurulum dosyasını açan herkes anahtarı çıkarabiliyor. VPS'te anahtar sadece Coolify env'inde durur; **bu açık A ile kapanıyor.** |
| **TLS** | sslip.io + Let's Encrypt, doğrulama listesi geçer geçmez. B'den önce şart. |
| **SSE token query param'da** | `backend/src/middleware/auth.ts:6` token'ı `?token=` ile de kabul ediyor; bu proxy access log'una JWT yazar. A'da dokunulmuyor (SSE endpoint'i frontend tarafından kullanılmıyor, `useScrapeJob` polling yapıyor), **B'de auth yeniden yazılırken kaldırılacak.** |
| Repo | `.env` ve `backend/.env` zaten `.gitignore`'da. `.dockerignore`'a da eklenecek ki imaja sızmasın. |

---

## 8. Bilinen kısıtlar (A'da kabul ediliyor)

1. **Tek process zorunlu.** `_lines.json` düz bir dosya ve kilitleme yok
   (`backend/src/services/whatsapp.ts:71,93` — `loadLines()` → değiştir → `saveLines()`).
   İki process aynı anda yazarsa hat kaydı kaybolur. Bu yüzden **replica sayısı 1**
   olmalı; PM2 cluster veya yatay ölçekleme yapılamaz. Tek kullanıcı için sorun değil.
   Kalıcı çözüm (veritabanına taşıma) B adımında değerlendirilecek.

2. **Kampanya durumu bellekte.** `campaigns` Map'i (`whatsapp.ts:76`) restart'ta kaybolur.
   §5'teki handler kotayı kurtarır ama kampanya kaldığı yerden devam etmez —
   kullanıcı yeniden başlatmalı.

3. **Frontend'in çağırdığı 4 endpoint grubu backend'de yok.**
   `/api/whatsapp/automation/settings/:feature`, `/api/whatsapp/rules`,
   `/api/whatsapp/templates`, `/api/whatsapp/scheduled` — şema tabloları
   `backend/schema.sql`'de var, kod yok. Auto-reply / karşılama / şablon / zamanlanmış
   kampanya sekmeleri **A'dan sonra da 404 vermeye devam edecek.** C adımının konusu.
   Bu, VPS taşımasının yol açtığı bir gerileme değil — mevcut durum.

4. **Bellek.** Her WhatsApp hattı ayrı bir headless Chromium (~250-400 MB), tarama
   sırasında bir Chromium daha açılır. 1 kullanıcı / 1-2 hat için 4 GB limit rahat yeter.

---

## 9. Doğrulama listesi

A adımı, aşağıdakilerin **tamamı** geçtiğinde bitmiş sayılır. Her madde canlı ortamda
elle koşulacak ve sonucu kaydedilecek.

| # | Test | Beklenen |
|---|---|---|
| 1 | `GET /health` | `{"status":"ok"}` |
| 2 | Tarayıcıdan panele giriş | Dashboard yükleniyor, konsol hatasız |
| 3 | Sayfa yenile (`/dashboard` üzerindeyken) | 404 değil, SPA açılıyor (fallback kanıtı) |
| 4 | WhatsApp hattı ekle | QR tarayıcıda görünüyor, okutunca `ready` |
| 5 | **Container restart** | Hat QR istemeden `ready`'ye dönüyor (**volume kanıtı**) |
| 6 | Tarama başlat | Lead'ler geliyor (**Chromium kanıtı**) |
| 7 | Tek WhatsApp mesajı gönder | Mesaj ulaşıyor, `outreach_logs`'a düşüyor |
| 8 | `GET /r/<shortId>` | Yönlendiriyor **ve** `short_id_clicks` artıyor |
| 9 | Deploy sırasında kampanya çalışırken restart | Kota iade ediliyor (§5 kanıtı) |
| 10 | 24 saat sonra `ps` | Zombi Chromium süreci birikmemiş (**tini kanıtı**) |
| 11 | Masaüstü build'i (`build.ps1`) | Hâlâ derleniyor ve çalışıyor (gerileme yok) |

---

## 10. Açık uçlar (B adımına devredildi)

- **ORM seçimi.** Kysely onaylandı, ancak aynı sunucuda `millitavir-web` zaten
  **Drizzle + kendi oturum sistemi + MEDIA_DIR** deseniyle çalışıyor. Tutarlılık
  açısından Drizzle daha uygun olabilir; B'nin brainstorm'unda `millitavir-web`'in
  koduna bakılıp karara bağlanacak. A'yı etkilemiyor.
- **Medya deposu.** `millitavir-cdn` container'ı `/data/millitavir/media`'yı salt-okunur
  servis ediyor. LeadPin'in `whatsapp-media` bucket'ı için aynı desen kullanılabilir.
- **`_lines.json` → Postgres.** §8 madde 1'deki tek-process kısıtını kaldırır.
- **Auth'ta `?token=` query param'ının kaldırılması** (§7).
