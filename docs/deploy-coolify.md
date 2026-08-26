# LeadPin — Coolify Deploy Rehberi

Bu belge, LeadPin'in VPS'te (Coolify) ayağa kaldırılması için izlenecek adımları
içerir. Tasarım gerekçeleri için bkz.
[spec](superpowers/specs/2026-08-26-vps-coolify-deploy-design.md).

**Hedef ortam:** Coolify v4.1.2 · `92.5.1.12` · proje `aqu-vps` / env `production`

---

## 1. Kaynağı oluştur

Coolify → `aqu-vps` → `production` → **+ New** → **Application** → **Public/Private
Repository**

| Alan | Değer |
|------|-------|
| Repository | `https://github.com/aquin0x/leadpin` |
| Branch | `main` |
| Build Pack | **Dockerfile** |
| Dockerfile konumu | `/Dockerfile` |
| Port | `4000` |
| Name | `leadpin` |

---

## 2. Ortam değişkenleri

Coolify → kaynak → **Environment Variables**

### 2.1 Build Variables — "Build Variable?" kutusu İŞARETLİ olmalı

> Vite bu değerleri **build anında** JS bundle'ına gömer; runtime'da verilirse
> frontend boş anahtarlarla derlenir. Dockerfile bu durumu yakalayıp build'i
> hata ile durdurur, yani yanlış yaparsanız sessizce bozulmaz.

| Anahtar | Değer |
|---------|-------|
| `VITE_SUPABASE_URL` | mevcut `backend/.env` içindeki `SUPABASE_URL` ile aynı |
| `VITE_SUPABASE_ANON_KEY` | Supabase panelindeki **anon/public** anahtar (service role DEĞİL) |
| `VITE_API_URL` | `/` |

### 2.2 Runtime Variables — "Build Variable?" kutusu İŞARETSİZ

| Anahtar | Değer | Not |
|---------|-------|-----|
| `SUPABASE_URL` | mevcut bulut değeri | |
| `SUPABASE_SERVICE_ROLE_KEY` | mevcut bulut değeri | **gizli** — sadece buraya |
| `NODE_ENV` | `production` | |
| `TZ` | `Europe/Istanbul` | |
| `ALLOWED_ORIGINS` | uygulamanın dış URL'i | §4'te netleşecek, önce boş bırakılabilir |
| `SHORT_LINK_REDIRECT_URL` | mevcut değer | kullanıcı ayarı yoksa yedek |

**Tanımlanmayacaklar** (imajda zaten ayarlı, elle verilirse yanlış olur):
`PORT`, `PUBLIC_DIR`, `APP_DATA_DIR`, `PUPPETEER_CACHE_DIR`,
`PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_HEADLESS`

---

## 3. Kalıcı disk — **atlanırsa her deploy'da QR okutmak gerekir**

Coolify → kaynak → **Persistent Storage** → **+ Add**

| Alan | Değer |
|------|-------|
| Name | `leadpin-data` |
| Mount Path | `/data` |

Burada WhatsApp oturumları (`.wwebjs_auth/session-<lineId>/`) ve hat listesi
(`_lines.json`) tutulur. Container yeniden başladığında `bootstrapLines()` bunları
okuyup hatları otomatik `ready` durumuna getirir.

---

## 4. Kaynak limiti ve alan adı

**Resource Limits** → Memory: `4G`
(Her WhatsApp hattı ayrı bir headless Chromium ≈ 250–400 MB; tarama sırasında bir
Chromium daha açılır. Bu limit sunucudaki diğer uygulamaları korur.)

**Domains:**
1. Önce `http://92.5.1.12:<atanan port>` ile doğrula.
2. Doğrulama listesi geçince Coolify'dan sslip.io alan adı ver:
   `https://leadpin.92-5-1-12.sslip.io` → Let's Encrypt sertifikasını Coolify alır.
   (Bu desen sunucuda `fraxlabs-web` ve `millitavir-web` üzerinde zaten çalışıyor.)
3. Alan adı kesinleşince `ALLOWED_ORIGINS`'i o adrese ayarla ve redeploy et.

> TLS, **B adımına geçmeden önce** açılmalı — aksi halde oturum jetonu düz metin gider.

---

## 5. Supabase tarafında yapılacak tek ayar

Panel herkese açık bir adreste olacak ve `src/pages/AuthPage.tsx` kayıt formu içeriyor.

Supabase Dashboard → **Authentication → Sign In / Providers → Email** →
**"Allow new users to sign up"** kapatılacak.

---

## 6. Doğrulama listesi

Deploy sonrası sırayla:

| # | Test | Beklenen |
|---|------|----------|
| 1 | `curl <URL>/health` | `{"status":"ok"}` |
| 2 | Tarayıcıdan panele giriş | Dashboard yükleniyor, konsol hatasız |
| 3 | `/dashboard` üzerindeyken sayfayı yenile | 404 değil, SPA açılıyor |
| 4 | WhatsApp hattı ekle | QR görünüyor, okutunca `ready` |
| 5 | **Coolify'dan Restart** | Hat QR istemeden `ready`'ye dönüyor |
| 6 | Tarama başlat | Lead'ler geliyor |
| 7 | Tek WhatsApp mesajı gönder | Ulaşıyor, geçmişe düşüyor |
| 8 | `<URL>/r/<shortId>` | Yönlendiriyor ve tıklama sayacı artıyor |
| 9 | Kampanya çalışırken Restart | Loglarda "mesaj kotası iade" satırı |
| 10 | 24 saat sonra container'da `ps aux \| grep -c defunct` | Zombi süreç birikmemiş |

---

## 7. Sorun giderme

| Belirti | Sebep | Çözüm |
|---------|-------|-------|
| Panel beyaz ekran, konsolda "Supabase URL ve Anon Key ... tanımlanmalıdır" | `VITE_*` değişkenleri Build Variable olarak işaretlenmemiş | §2.1, sonra **rebuild** (restart yetmez — değerler bundle'a gömülü) |
| Hat eklerken `ready` olmuyor, log'da Chrome hatası | Chrome yolu çözülememiş | Container log'unda ilk satırdaki `Chrome: ...` çıktısına bak; yoksa entrypoint çalışmamış |
| Her deploy'da QR isteniyor | `/data` volume'ü bağlı değil | §3 |
| Deploy sonrası mesaj kotası eksilmiş | Graceful shutdown çalışmamış | Log'da `SIGTERM alındı` satırını ara; Coolify'ın kapanış timeout'u 15 sn'den kısa olmamalı |
| `exec format error` | `docker-entrypoint.sh` CRLF ile commit'lenmiş | `.gitattributes` bunu engelliyor; dosyayı LF ile yeniden kaydet |

Container içinde kabuk: Coolify → kaynak → **Terminal**

---

## 8. Bu adımda çözülmeyenler (bilerek)

- Supabase hâlâ bulutta — B adımının konusu
- Auto-reply / karşılama / şablon / zamanlanmış kampanya sekmeleri 404 veriyor
  (backend'de karşılıkları hiç yazılmamış) — C adımının konusu
- Tek process zorunlu: `_lines.json` dosya kilidi olmadığı için replica sayısı
  **1** kalmalı
