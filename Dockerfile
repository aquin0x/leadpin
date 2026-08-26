# LeadPin — sunucu (Coolify) imajı
#
# Tek container: Express hem REST API'yi hem React SPA'yı servis eder. Panel ve API
# aynı origin'de olduğu için CORS devreye girmez.
#
# Masaüstü (Tauri sidecar) dağıtımı bu dosyadan etkilenmez — orada backend `pkg` ile
# exe'ye paketlenir ve SPA'yı webview yükler.

# ─────────────────────────────────────────────────────────────────────────────
# 1) Frontend build
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm AS frontend-build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite VITE_* değişkenlerini BUILD ANINDA bundle'a gömer; runtime'da verilemezler.
# Coolify tarafında bunlar "Build Variable" olarak işaretlenmiş olmalı.
# process.env'deki VITE_* değerleri .env dosyalarını ezer, dolayısıyla bu arg'lar
# repodaki herhangi bir .env'den önceliklidir.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL=/
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_URL=$VITE_API_URL

# Anahtarlar boşsa src/lib/supabase.ts çalışma anında exception fırlatır ve panel
# beyaz ekran verir. Hatayı build'de yakalamak, tarayıcı konsolunda aramaktan iyidir.
RUN test -n "$VITE_SUPABASE_URL" \
      || (echo "HATA: VITE_SUPABASE_URL build argümanı boş. Coolify'da 'Build Variable' olarak tanımlayın." && exit 1) \
 && test -n "$VITE_SUPABASE_ANON_KEY" \
      || (echo "HATA: VITE_SUPABASE_ANON_KEY build argümanı boş. Coolify'da 'Build Variable' olarak tanımlayın." && exit 1)

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# 2) Backend build
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm AS backend-build
WORKDIR /app/backend

ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# 3) Runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR=/opt/puppeteer \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_HEADLESS=true \
    PORT=4000 \
    PUBLIC_DIR=/app/public \
    APP_DATA_DIR=/data

# Chromium'un headless çalışması için gereken paylaşımlı kütüphaneler + fontlar.
# tini: Puppeteer'ın açtığı Chromium süreçleri bir init süreci olmadan zombi bırakır
# ve container zamanla process tablosunu doldurur — Docker'da en yaygın Puppeteer tuzağı.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libatspi2.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libglib2.0-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Chrome'u puppeteer'ın kendisi indirir — sürüm-eşli gelir. Debian'ın `chromium`
# paketi kullanılmıyor: whatsapp-web.js sürüm uyumu konusunda seçici.
RUN npx puppeteer browsers install chrome

COPY --from=backend-build /app/backend/dist ./dist
COPY --from=frontend-build /app/dist /app/public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data \
 && chown -R node:node /data /opt/puppeteer /app

USER node
WORKDIR /app
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "backend/dist/index.js"]
