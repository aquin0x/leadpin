# LeadPin — Supabase'den Self-Hosted Postgres'e Geçiş

**Tarih:** 2026-08-26
**Durum:** Onay bekliyor
**Kapsam:** Adım A+B birleşik — container'a alma (tamamlandı) + veri katmanının Postgres'e taşınması

---

## 1. Planın neden değiştiği

Önceki plan üç adımdı: **A** container'a al (bulut Supabase'e bağlı kalarak) → **B**
Postgres'e geç → **C** eksik otomasyon endpoint'leri.

A'nın uygulaması sırasında bulut Supabase projesinin **artık var olmadığı** ortaya çıktı:

```
backend/.env'deki proje hostname'i  → ENOTFOUND   (hem container'da hem host'ta)
supabase.co                         → 76.76.21.21 (çözümleniyor)
example.com                         → HTTP 200    (ağ ve TLS sağlam)
```

`.env` 23 Nisan'dan kalma; Supabase ücretsiz projeleri hareketsizlikten duraklatıp
siliyor. A'nın "bulut Supabase'e bağlı kal" varsayımının koruyacağı bir şey kalmadı
ve veri zaten sıfırdan başlayacaktı — yeni bir Supabase projesi açıp şemayı kurup
birkaç gün sonra atmak saf israf olurdu. Bu yüzden A ve B birleştirildi.

A'nın altyapı riski zaten kapatıldı (bkz. §2), dolayısıyla ayrıştırma gerekçesi
büyük ölçüde karşılanmış durumda.

**C adımı (auto-reply, karşılama, şablon, zamanlanmış kampanya endpoint'leri) bu
belgenin kapsamı dışında** ve ayrı bir spec olarak kalıyor. Tabloları bu geçişte
kurulur, endpoint'leri sonra yazılır.

---

## 2. Halihazırda tamamlanan (A adımı)

Container altyapısı yazıldı, build edildi ve çalışan imaj üzerinde doğrulandı.
Commit'ler: `c466169`, `7567582`.

| Doğrulanan | Sonuç |
|---|---|
| `/health` | `{"status":"ok"}`, 1 sn'de ayakta |
| SPA fallback (`/`, `/dashboard`, `/businesses/abc`) | 200 `text/html` |
| `/api/*` kimliksiz | 401 (SPA'ya düşmüyor) |
| Chrome başlatma + DOM render | 894 ms, `Chrome/147.0.7727.56` |
| whatsapp-web.js yüklenmesi | 1.34.6 |
| `/data` yazılabilirliği, non-root çalışma | `uid=1000(node)` |
| PID 1 | `tini` (zombi Chromium koruması) |
| SIGTERM graceful shutdown | 1 sn, çıkış kodu 0 |
| İmaj boyutu | 1.16 GB (`chown -R` katmanı giderildikten sonra) |

Bu çalışma **korunuyor**; aşağıdaki değişiklikler onun üzerine geliyor.

---

## 3. Hedef mimari

```
┌──────────────── Coolify (Traefik) ────────────────┐
│  https://leadpin.92-5-1-12.sslip.io               │
└──────────────────────┬────────────────────────────┘
                       │
          ┌────────────▼─────────────┐
          │  leadpin container       │
          │  Express :4000           │
          │   ├─ /            → SPA  │
          │   ├─ /api/*       → REST │
          │   ├─ /r/:shortId  → link │
          │   ├─ /media/*     → dosya│
          │   ├─ Drizzle + pg        │
          │   ├─ kendi auth (JWT)    │
          │   └─ günlük temizlik işi │
          └───────┬──────────┬───────┘
        volume    │          │ Docker ağı
     ┌────────────▼──┐   ┌───▼─────────────────────┐
     │ /data         │   │ postgres:18-alpine      │
     │  .wwebjs_auth │   │ (mevcut merkezi sunucu) │
     │  media/       │   │ yeni veritabanı: leadpin│
     └───────────────┘   └─────────────────────────┘
```

Supabase yığınından hiçbir şey kalmıyor: PostgREST yerine Drizzle, GoTrue yerine
kendi auth'umuz, Storage yerine disk, Realtime düşüyor (frontend zaten polling
yapıyor — `useScrapeJob.ts`).

---

## 4. Teknoloji seçimleri

| Katman | Seçim | Gerekçe |
|---|---|---|
| Sorgu | **Drizzle ORM 0.45** + `pg` 8.23 | Aynı sunucudaki `millitavir-web` ile aynı desen; `drizzle-kit` migration'ları hazır getirir (bu projede migration altyapısı hiç yok); saf JS → masaüstü `pkg` build'i bozulmaz |
| Migration | **drizzle-kit 0.31** | `backend/drizzle/` altında sürümlenmiş SQL; `schema.sql`'in elle çalıştırılması sona erer |
| Şifre | **`node:crypto` scrypt** | Node'un içinde, sıfır bağımlılık, pkg'de sorunsuz. `bcrypt`/`argon2` native → pkg'yi bozar |
| JWT | **`jsonwebtoken` 9** | Backend CommonJS derliyor; `jose` v6'nın exports haritasında `require` koşulu yok (ESM-only) ve `require()` ile kırılır. Bu doğrulandı. |
| Medya | Disk (`/data/media`) + Express static | Tek kullanıcı; bucket'a gerek yok |

**Elenen:** Prisma (native engine → pkg'yi bozar), Kysely (Drizzle ile aynı işi
yapar ama migration aracı ayrıca kurulmalı ve sunucudaki diğer uygulamayla
tutarsız olur).

---

## 5. Veritabanı

### 5.1 Konum

Sunucuda çalışan mevcut merkezi `postgres:18-alpine` örneği kullanılacak; içinde
**yeni bir `leadpin` veritabanı** ve ona özel bir rol açılacak. Ayrı bir Postgres
kaynağı açılmıyor — merkezi sunucunun amacı bu.

Bağlantı Docker iç ağı üzerinden yapılacak, `DATABASE_URL` ile verilecek.
Postgres dışarı açılmayacak.

> Veritabanının ve rolün oluşturulması ile `DATABASE_URL`'in Coolify'a girilmesi
> **kullanıcı tarafından yapılacak** — veritabanı kimlik bilgileri ve JWT gizli
> anahtarı gibi değerleri asistan giremez. Şema, migration'lar ve kodun tamamı
> asistan tarafında; devir teslim noktası yalnızca bu kimlik bilgileri.

### 5.2 Şema dönüşümü

`backend/schema.sql` kaldırılıp yerine `backend/src/db/schema.ts` (Drizzle) gelecek.
Tablo yapıları birebir korunuyor; yalnızca Supabase'e özgü kısımlar değişiyor:

| Supabase'e özgü | Kapsam | Karşılığı |
|---|---|---|
| `auth.users(id)` FK'leri | 12 tablo | Yeni `users` tablosu |
| `auth.uid()` default'ları | `scrape_jobs`, `outreach_logs`, `lists` | Kaldırılıyor — `user_id`'yi backend yazıyor |
| RLS politikaları | 25+ policy | Düşüyor (backend zaten `service_role` ile bypass ediyordu) |
| `storage.buckets` + storage policy'leri | `whatsapp-media` | `/data/media` |
| `track_short_id_click()` RPC | 1 fonksiyon | **Siliniyor** — kodda hiç çağrılmıyor (doğrulandı), `/r/` handler'ı elle `update` yapıyor |
| `pg_cron` job'ları | 2 günlük temizlik | Backend zamanlayıcısı, §7 |
| `security definer` | 2 fonksiyon + view | Sade fonksiyona dönüyor (bypass edilecek RLS kalmadı) |

`gen_random_uuid()`, `text[]`, `int[]` ve `businesses_expiring_soon` view'i
Postgres 18'de yerleşik olarak çalışır, değişmiyor.

### 5.3 Yeni tablo: `users`

```
id             uuid pk default gen_random_uuid()
email          text unique not null
password_hash  text not null          -- scrypt: <salt>:<hash>
is_admin       boolean not null default false
link_owner     boolean not null default false
created_at     timestamptz not null default now()
updated_at     timestamptz not null default now()
```

`is_admin` ve `link_owner` bugün `auth.users.raw_app_meta_data` içinde JSON olarak
duruyor ve Supabase panelinden elle set ediliyor. Artık normal kolonlar oluyorlar.

### 5.4 Yeni tablo: `whatsapp_lines` — `_lines.json`'ın yerine

Bugün hangi kullanıcının hangi WhatsApp hattı olduğu diskte kilitsiz bir JSON
dosyasında tutuluyor (`whatsapp.ts` — `loadLines()` → değiştir → `saveLines()`).
Bu, backend'in **tek process** olmasını zorunlu kılıyor: iki process aynı anda
yazarsa hat kaydı kaybolur.

Plan/abonelik sistemi korunacağı ve ileride müşteri olacağı için bu kısıt kalıcı
bir engel. Veri katmanını zaten yeniden yazdığımız için maliyeti düşük:

```
id          uuid pk
user_id     uuid not null references users(id) on delete cascade
label       text not null
phone       text
created_at  timestamptz not null default now()
```

Chromium oturum dosyaları (`.wwebjs_auth/session-<lineId>/`) diskte kalmaya devam
ediyor — onlar zaten process-yerel.

### 5.5 Korunan: plan / abonelik / token sistemi

`plans`, `subscriptions`, `subscription_tokens` tabloları ve `subscription.ts`
(292 satır) aynen taşınıyor. Tek kullanıcı admin olduğu için bugün limitler
bypass ediliyor, ama ileride müşteri olacağı için altyapı korunuyor.

---

## 6. Auth

Kendi implementasyonumuz. Supabase Auth'un davranışına yakın kalınarak frontend
değişikliği en aza indiriliyor.

### 6.1 Backend

| Endpoint | İş |
|---|---|
| `POST /api/auth/signup` | Kayıt. `SIGNUP_ENABLED=false` ise 403 |
| `POST /api/auth/login` | E-posta + şifre → JWT |
| `GET  /api/auth/me` | Mevcut kullanıcı (`is_admin`, `link_owner` dahil) |
| `PUT  /api/auth/password` | Mevcut şifre doğrulanarak değiştirme |
| `PUT  /api/auth/email` | Mevcut şifre doğrulanarak değiştirme |

- **Şifre:** `crypto.scrypt`, kayıt başına rastgele salt, `timingSafeEqual` ile
  karşılaştırma.
- **Jeton:** HS256 JWT, **7 gün** ömür, `JWT_SECRET` env'inden. Payload: `sub`
  (user id), `email`. Süre dolunca yeniden giriş — refresh token yok (tek
  kullanıcılı iç araç için gereksiz karmaşıklık).
- **İlk kullanıcı:** container açılışında `SEED_ADMIN_EMAIL` /
  `SEED_ADMIN_PASSWORD` env'leri varsa ve `users` boşsa admin kullanıcı oluşturulur.
  Böylece kapalı kayıtla bile ilk giriş mümkün olur.
- `middleware/auth.ts` artık `supabase.auth.getUser()` yerine JWT doğrular ve
  kullanıcıyı DB'den çeker.
- **`?token=` query param'ı kaldırılıyor** — ters vekil access log'una JWT yazıyordu.
  Kullanan tek yer SSE endpoint'i, o da frontend tarafından kullanılmıyor.

### 6.2 Frontend

`src/lib/supabase.ts` silinip yerine `src/lib/auth-client.ts` geliyor; aynı
şekle yakın bir arayüz sunuyor (`getSession`, `signIn`, `signUp`, `signOut`,
`updateUser`, `onAuthStateChange`) ki çağıran 13 nokta minimum değişsin.

Jeton `localStorage`'da tutulacak — Supabase de aynısını yapıyordu.

Değişecek dosyalar: `ProtectedRoute.tsx`, `AuthPage.tsx`, `AccountDialog.tsx`
(4 çağrı), `useIsLinkOwner.ts`, `useScrapeJob.ts`, `api-client.ts`,
`DashboardPage.tsx`.

---

## 7. pg_cron yerine backend zamanlayıcısı

`schema.sql` günlük iki temizlik işini `pg_cron` ile kuruyor. **`postgres:18-alpine`
imajında `pg_cron` yok** — Supabase'e özgü bir kolaylıktı.

`backend/src/services/cleanup.ts` bu işi devralıyor: açılışta bir kez, sonra
24 saatte bir çalışır.

1. `cleanup_unused_businesses` — 60 günden eski, hiçbir listede olmayan ve hiç
   mesaj atılmamış lead'leri siler
2. `cleanup_old_outreach_logs` — 60 günden eski log'ları siler

`businesses_expiring_soon` view'i (frontend'in "yakında silinecek" banner'ı buna
bağlı) korunuyor.

---

## 8. Medya

`whatsapp-media` bucket'ı yerine `/data/media/<userId>/<uuid>.<ext>`.

- `POST /api/storage/upload` base64'ü diske yazar, `{PUBLIC_BASE_URL}/media/...`
  döner
- `DELETE /api/storage/media` yol kullanıcının kendi klasöründeyse siler
  (mevcut kontrol korunuyor)
- Express `/media` altını statik servis eder
- Boyut sınırı 16 MB olarak korunuyor

`whatsapp_message_templates.media` ve `whatsapp_scheduled_campaigns.media` jsonb
kolonları değişmiyor; içindeki URL'ler artık kendi sunucumuzu gösterecek.

---

## 9. Sorgu dönüşümü — envanter

**64 `supabase.from()` çağrısı, 9 dosya.**

| Dosya | Çağrı |
|---|---|
| `controllers/business.controller.ts` | 18 |
| `services/subscription.ts` | 14 |
| `controllers/list.controller.ts` | 9 |
| `services/scraper.ts` | 8 |
| `index.ts` | 5 |
| `services/whatsapp.ts` | 4 |
| `controllers/user-settings.controller.ts` | 3 |
| `routes/subscription.routes.ts` | 2 |
| `controllers/whatsapp.controller.ts` | 1 |

Düz CRUD'un dışında özel ilgi isteyen üç kalıp:

**9.1 Gömülü ilişki seçimleri → JOIN (6 yer)**
`business:businesses(...)` / `list:lists(...)` PostgREST sözdizimi.
`index.ts:132,133,150,240`, `list.controller.ts:109`, `whatsapp.ts:682`.
Drizzle'da `leftJoin` + açık alan seçimi olacak; dönen nesnenin **şekli
korunacak** (frontend `row.business.name` bekliyor).

**9.2 `.or('user_id.eq.X,user_id.is.null')` → `user_id = X` (5 yer)**
`business.controller.ts:30,123,129,137,147`.

> Bu bir **veri sızıntısı**: `user_id` null olan her kayıt tüm kullanıcılara
> görünüyor. Tek kullanıcıyken zararsız, çok kullanıcıda değil. `schema.sql`'de
> RLS tarafı zaten düzeltilmişti; sorgu tarafı geride kalmış. Yeniden yazımda
> düz eşitliğe çevriliyor.

**9.3 `count: 'exact'` → ayrı `COUNT(*)` sorgusu (8 yer)**
Sayfalama toplamları için; Drizzle'da ikinci bir sorgu olacak.

**`.rpc()` çağrısı yok** — `track_short_id_click` fonksiyonu hiç kullanılmıyor,
siliniyor.

---

## 10. Masaüstü sürümü

Masaüstü build'i (`src-tauri/`, `build.ps1`, `build.sh`, release workflow)
bozulmadan kalıyor. Seçilen kütüphanelerin hepsi saf JS olduğu için `pkg`
paketlemesi çalışmaya devam eder.

**Değişen davranış:** masaüstü sürümü artık kendi başına çalışamaz — VPS'teki
Postgres'e bağlanması gerekir. Yani `DATABASE_URL` masaüstünde de tanımlı olmalı
ve Postgres dışarı açılmalıdır.

> Postgres'i internete açmak istemiyorsan masaüstü sürümü fiilen kullanılamaz
> hale gelir. Tek kullanıcı için tarayıcıdan kullanmak zaten yeterli olduğundan,
> **masaüstünü kullanmamayı** öneriyorum; kod bozulmadan duracağı için ileride
> gerekirse geri dönülebilir. Bu, uygulamada bir karar noktası olarak
> işaretlenmiştir.

---

## 11. Ortam değişkenleri

**Build (Coolify'da "Build Variable" işaretli):**

| Anahtar | Değer |
|---|---|
| `VITE_API_URL` | `/` |

> Supabase kaldırıldığı için `VITE_SUPABASE_*` build argümanları da kalkıyor;
> Dockerfile'daki boşluk kontrolü buna göre güncellenecek.

**Runtime:**

| Anahtar | Not |
|---|---|
| `DATABASE_URL` | Docker iç ağı üzerinden merkezi Postgres |
| `JWT_SECRET` | **gizli**, rastgele 32+ bayt |
| `SIGNUP_ENABLED` | `false` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | İlk kullanıcı; kurulumdan sonra kaldırılabilir |
| `PUBLIC_BASE_URL` | Medya URL'lerinin üretiminde |
| `ALLOWED_ORIGINS` | Dış URL |
| `SHORT_LINK_REDIRECT_URL` | Kullanıcı ayarı yoksa yedek |
| `NODE_ENV` / `TZ` | `production` / `Europe/Istanbul` |

Kalkanlar: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`.

---

## 12. Uygulama sırası

Her aşama sonunda `tsc` temiz olmalı.

1. **Temel** — Drizzle + pg kurulumu, `schema.ts`, ilk migration, `leadpin` veritabanı
2. **Auth** — `users` tablosu, scrypt, JWT, endpoint'ler, middleware, admin seed
3. **Sorgular** — 64 çağrı dosya dosya; her dosya bitince derleme kontrolü
4. **Medya + temizlik** — disk deposu, günlük görev
5. **Hatlar** — `_lines.json` → `whatsapp_lines`
6. **Frontend** — `auth-client.ts`, 13 çağrı noktası
7. **Dockerfile + deploy** — Supabase build arg'larını kaldır, Coolify'a kur

---

## 13. Doğrulama listesi

| # | Test | Beklenen |
|---|------|----------|
| 1 | `GET /health` | `{"status":"ok"}` |
| 2 | Seed admin ile giriş | JWT dönüyor, dashboard açılıyor |
| 3 | `SIGNUP_ENABLED=false` iken kayıt | 403 |
| 4 | Yanlış şifre | 401, zamanlama farkı sızdırmıyor |
| 5 | Şifre değiştir → yeni şifreyle giriş | Çalışıyor |
| 6 | Sayfa yenile (`/dashboard`) | Oturum korunuyor |
| 7 | Tarama başlat | Lead'ler `businesses` tablosuna düşüyor |
| 8 | Lead listesi + filtreler + sayfalama | Toplam sayı doğru (`count` dönüşümü) |
| 9 | Liste oluştur, lead ekle | `list_items` doğru |
| 10 | WhatsApp hattı ekle | QR çıkıyor, `whatsapp_lines`'a yazılıyor |
| 11 | Container restart | Hat QR istemeden `ready` |
| 12 | Tek mesaj gönder | Ulaşıyor, `outreach_logs`'a düşüyor |
| 13 | Mesaj geçmişi (gruplu) | Batch satırları doğru (**JOIN dönüşümü**) |
| 14 | Medya yükle → şablona ekle | `/media/...` üzerinden görüntüleniyor |
| 15 | `/r/<shortId>` | Yönlendiriyor, sayaç artıyor |
| 16 | Temizlik görevi elle tetiklenir | Eski kayıtlar siliniyor, yenileri duruyor |
| 17 | İkinci kullanıcı aç, ilk kullanıcının verisi | **Görünmüyor** (§9.2 sızıntısı kapandı) |
| 18 | Kampanya çalışırken restart | Kota iadesi log'da |
| 19 | Masaüstü build (`build.ps1`) | Hâlâ derleniyor |

---

## 14. Kapsam dışı

- **C adımı:** auto-reply, karşılama, şablon ve zamanlanmış kampanya endpoint'leri.
  Tabloları bu geçişte kurulacak, endpoint'leri ayrı bir spec ile yazılacak.
  O dört sekme bu iş bittikten sonra da 404 vermeye devam edecek.
- Realtime / SSE — `postgres_changes` kanalı siliniyor, frontend zaten polling yapıyor.
- Bulut Supabase'den veri taşıma — proje yok, veri sıfırdan başlıyor.
