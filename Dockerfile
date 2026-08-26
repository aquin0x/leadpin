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
# Bir kez tekrar denenir: esbuild'in kurulum betiği, henüz yazdığı ikiliyi
# doğrulamak için çalıştırıyor ve Docker'ın overlay dosya sisteminde arada
# ETXTBSY alıyor. Kararsız bir yarış durumu — ikinci deneme geçiyor. Bu
# olmadan Coolify deploy'ları ara sıra sebepsiz düşerdi.
RUN npm ci || npm ci

COPY . .

# Vite VITE_* değişkenlerini BUILD ANINDA bundle'a gömer; runtime'da verilemezler.
# Sunucu dağıtımında "/" kullanılır: panel ve API aynı origin'de olduğu için
# istekler relative gider ve CORS devreye girmez.
#
# Supabase artık kullanılmadığı için VITE_SUPABASE_* argümanları kaldırıldı;
# frontend'in tek yapılandırması bu.
ARG VITE_API_URL=/
ENV VITE_API_URL=$VITE_API_URL

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

# Entrypoint root olarak kurulur. İsim bilerek "leadpin-" önekli: temel node
# imajının kendi /usr/local/bin/docker-entrypoint.sh dosyası var, aynı adı
# kullanmak onu sessizce ezer.
COPY docker-entrypoint.sh /usr/local/bin/leadpin-entrypoint.sh
# CRLF satır sonu shebang'i bozar ve container "exec ... No such file or
# directory" ile ölür — hata mesajı da sebebi hiç düşündürmez. .gitattributes
# bunu commit sırasında normalleştiriyor, ama Docker çalışma ağacından build
# ettiği için Windows'ta düzenlenmiş bir dosya yine CRLF ile gelebilir.
RUN sed -i 's/\r$//' /usr/local/bin/leadpin-entrypoint.sh \
 && chmod +x /usr/local/bin/leadpin-entrypoint.sh

# Dizinler BOŞKEN sahiplenilir, sonra node kullanıcısına geçilir. Böylece Chrome
# ve node_modules zaten doğru sahiplikle oluşur.
#
# Bunun yerine en sonda `chown -R` yapmak imaja 556 MB'lık fazladan bir katman
# ekliyordu: recursive chown her dosyanın metadata'sını değiştirdiği için Docker
# hepsini yeni katmana kopyalar.
RUN mkdir -p /app/backend /app/public /data /opt/puppeteer \
 && chown -R node:node /app /data /opt/puppeteer

USER node
WORKDIR /app/backend

COPY --chown=node:node backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Chrome'u puppeteer'ın kendisi indirir — sürüm-eşli gelir. Debian'ın `chromium`
# paketi kullanılmıyor: whatsapp-web.js sürüm uyumu konusunda seçici.
RUN npx puppeteer browsers install chrome

COPY --chown=node:node --from=backend-build /app/backend/dist ./dist
COPY --chown=node:node --from=frontend-build /app/dist /app/public

# Migration'lar açılışta uygulanır (entrypoint). drizzle-kit devDependency
# olduğu için üretim imajında yok; bunun yerine dist'e derlenmiş küçük bir
# migrate betiği kullanılır.
COPY --chown=node:node backend/drizzle ./drizzle

WORKDIR /app
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/leadpin-entrypoint.sh"]
CMD ["node", "backend/dist/index.js"]
