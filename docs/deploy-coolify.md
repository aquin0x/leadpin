# LeadPin — Coolify Deploy Rehberi

LeadPin'in VPS'te (Coolify) ayağa kaldırılması. Tasarım gerekçeleri için bkz.
[spec](superpowers/specs/2026-08-26-postgres-migration-design.md).

**Hedef ortam:** Coolify v4.1.2 · `92.5.1.12` · proje `aqu-vps` / env `production`

Uygulama artık Supabase kullanmıyor. Veri, sunucuda zaten çalışan merkezi
`postgres:18-alpine` örneğindeki `leadpin` veritabanında durur; kimlik doğrulama
uygulamanın kendi JWT'siyle, medya ise kalıcı diskte tutulur.

---

## 1. Veritabanını hazırla

Coolify → Databases → merkezi `postgres` kaynağı → **Terminal**:

```sql
create database leadpin;
create user leadpin_app with password 'GÜÇLÜ-BİR-PAROLA-ÜRET';
grant all privileges on database leadpin to leadpin_app;
\c leadpin
grant all on schema public to leadpin_app;
```

Tabloları elle kurmaya gerek yok — container açılışta migration'ları kendisi
uygular.

Bağlantı dizesi (Coolify iç ağı üzerinden, dışarı açılmadan):

```
postgres://leadpin_app:PAROLA@<postgres-servis-adı>:5432/leadpin
```

Servis adını Coolify'daki Postgres kaynağının **Postgres URL (internal)**
alanından alabilirsin.

## 2. Uygulama kaynağını oluştur

Coolify → `aqu-vps` → `production` → **+ New** → **Application** →
**Public Repository**

| Alan | Değer |
|------|-------|
| Repository | `https://github.com/aquin0x/leadpin` |
| Branch | `main` |
| Build Pack | **Dockerfile** |
| Dockerfile konumu | `/Dockerfile` |
| Port | `4000` |
| Name | `leadpin` |

## 3. Ortam değişkenleri

**Build Variable** (kutu İŞARETLİ):

| Anahtar | Değer |
|---------|-------|
| `VITE_API_URL` | `/` |

> Vite bunu build anında bundle'a gömer. Zaten Dockerfile'da varsayılanı `/`,
> yani atlanırsa da doğru değerle derlenir.

**Runtime** (kutu İŞARETSİZ):

| Anahtar | Değer | Not |
|---------|-------|-----|
| `DATABASE_URL` | §1'deki bağlantı dizesi | **gizli** |
| `JWT_SECRET` | `openssl rand -hex 32` çıktısı | **gizli**, en az 32 karakter — kısa olursa uygulama açılışta hata verir |
| `SIGNUP_ENABLED` | `false` | `true` yapılmadıkça kayıt kapalı |
| `SEED_ADMIN_EMAIL` | ilk giriş e-postan | |
| `SEED_ADMIN_PASSWORD` | ilk giriş şifren | En az 8 karakter. İlk açılışta hesap oluşur; **sonra bu ikisini kaldırabilirsin** — tablo doluysa hiçbir şey yapmazlar, mevcut şifreyi ezmezler |
| `PUBLIC_BASE_URL` | uygulamanın dış URL'i | Yüklenen medyanın URL'lerinde kullanılır |
| `ALLOWED_ORIGINS` | uygulamanın dış URL'i | §5'te netleşir |
| `SHORT_LINK_REDIRECT_URL` | yedek landing adresi | Kullanıcı kendi adresini ayarlarsa o kullanılır |
| `TZ` | `Europe/Istanbul` | |

**Tanımlanmayacaklar** (imajda ayarlı, elle verilirse yanlış olur):
`PORT`, `PUBLIC_DIR`, `APP_DATA_DIR`, `PUPPETEER_CACHE_DIR`,
`PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_HEADLESS`, `NODE_ENV`

## 4. Kalıcı disk — **atlanırsa her deploy'da QR okutmak gerekir**

Coolify → kaynak → **Persistent Storage** → **+ Add**

| Alan | Değer |
|------|-------|
| Name | `leadpin-data` |
| Mount Path | `/data` |

Burada iki şey durur:
- `/data/.wwebjs_auth/session-<lineId>/` — WhatsApp Chromium oturumları
- `/data/media/<userId>/` — yüklenen medya

Hat üstverisi artık veritabanında, ama Chromium oturum dosyaları hâlâ diskte;
volume olmadan her deploy hatları sıfırlar.

## 5. Kaynak limiti ve alan adı

**Resource Limits** → Memory: `4G`
(Her WhatsApp hattı ayrı bir headless Chromium ≈ 250–400 MB; tarama sırasında
bir Chromium daha açılır.)

**Domains:**
1. Önce `http://92.5.1.12:<atanan port>` ile doğrula.
2. Doğrulama listesi geçince sslip.io alan adı ver:
   `https://leadpin.92-5-1-12.sslip.io` → Let's Encrypt sertifikasını Coolify alır.
   Bu desen sunucuda `fraxlabs-web` ve `millitavir-web` üzerinde zaten çalışıyor.
3. Alan adı kesinleşince `ALLOWED_ORIGINS` ve `PUBLIC_BASE_URL`'i o adrese
   ayarla ve **yeniden deploy et** (`PUBLIC_BASE_URL` medya URL'lerine yazılır).

> TLS'i erken aç: HTTPS olmadan oturum jetonu düz metin gider.

---

## 6. Doğrulama listesi

| # | Test | Beklenen |
|---|------|----------|
| 1 | `curl <URL>/health` | `{"status":"ok"}` |
| 2 | Container log'u | `[migrate] migrationlar uygulandı` + `ilk admin kullanıcı oluşturuldu` |
| 3 | `SEED_ADMIN_*` ile giriş | Dashboard açılıyor |
| 4 | `/dashboard` üzerindeyken sayfayı yenile | 404 değil, SPA açılıyor |
| 5 | Kayıt formunu dene | "Yeni kayıt kapalı." (403) |
| 6 | Tarama başlat | Lead'ler geliyor (Chromium çalışıyor) |
| 7 | WhatsApp hattı ekle | QR görünüyor, okutunca `ready` |
| 8 | **Coolify'dan Restart** | Hat QR istemeden `ready`'ye dönüyor |
| 9 | Şablona medya yükle | `/media/...` üzerinden görüntüleniyor |
| 10 | `<URL>/r/<shortId>` | Yönlendiriyor, tıklama sayacı artıyor |
| 11 | 24 saat sonra container'da `ps aux \| grep -c defunct` | Zombi süreç birikmemiş |

---

## 7. Sorun giderme

| Belirti | Sebep | Çözüm |
|---------|-------|-------|
| `exec /usr/local/bin/leadpin-entrypoint.sh failed: No such file or directory` | Betik CRLF satır sonuyla gelmiş | Dockerfile bunu `sed` ile temizliyor; yine olursa dosyayı LF ile kaydet |
| Açılışta `JWT_SECRET tanımlı değil veya 32 karakterden kısa` | Anahtar eksik/kısa | §3 |
| `[migrate] başarısız` | `DATABASE_URL` yanlış veya veritabanı erişilemiyor | Coolify Terminal'den `psql "$DATABASE_URL" -c 'select 1'` |
| Girişte "E-posta veya şifre hatalı" ama şifre doğru | `SEED_ADMIN_*` ilk açılıştan sonra değiştirildi | Seed yalnızca tablo boşken çalışır; şifreyi panelden değiştir |
| Her deploy'da QR isteniyor | `/data` volume'ü bağlı değil | §4 |
| Build ara sıra `npm ci` ile düşüyor | esbuild kurulumunda ETXTBSY yarışı | Dockerfile bir kez tekrar deniyor; ısrar ederse deploy'u yeniden tetikle |
| Medya URL'leri yanlış host gösteriyor | `PUBLIC_BASE_URL` eski | Güncelle ve yeniden deploy et; eski kayıtlardaki URL'ler değişmez |

Container içinde kabuk: Coolify → kaynak → **Terminal**

---

## 8. Bu adımda çözülmeyenler (bilerek)

- Masaüstü (Tauri) sürümü derleniyor ama artık kendi başına çalışamaz — Postgres'e
  erişmesi gerekir. Postgres dışarı açılmadığı sürece pratikte kullanılamaz.

## 9. Otomasyon davranışı (bilinmesi gerekenler)

- **Karşılama** yalnızca bize ilk kez yazan ve daha önce bizim mesaj
  göndermediğimiz kişilere gider. Kampanya gönderdiğin bir lead cevap yazarsa
  karşılama almaz.
- Bir mesaj hem karşılamayı hem bir anahtar kelimeyi tetiklerse **sadece
  karşılama** gönderilir; kelime cevabı bir sonraki mesaja kalır.
- **Zamanlanmış kampanyanın** vakti aktif pencere dışında gelirse kampanya
  `failed` olur ve beklemez. Hata mesajı pencereyi ve zaman dilimini yazar.
  Gece yarısını aşan pencereler (ör. 22:00–06:00) desteklenir.
- "Kişi başına 1 oto-cevap" açıksa, hangi kural olursa olsun o kişiye toplam
  bir cevap gider; kural bazlı cooldown ve "kişi başına bir kez" ayarlarının
  üstünde çalışır.
- Otomasyon yalnızca **birebir sohbetlerde** çalışır; gruplar ve durum
  yayınları yok sayılır.
