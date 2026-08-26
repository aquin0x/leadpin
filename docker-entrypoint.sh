#!/bin/sh
# Chrome'un tam yolu kurulan sürüme bağlı (/opt/puppeteer/chrome/linux-<sürüm>/...).
# Dockerfile'a sabit yazmak yerine puppeteer'ın kendisine sorduruyoruz; böylece
# puppeteer sürümü yükselip Chrome sürümü değiştiğinde elle güncelleme gerekmez.
set -e

if [ -z "$PUPPETEER_EXECUTABLE_PATH" ]; then
  PUPPETEER_EXECUTABLE_PATH="$(node -e "console.log(require('/app/backend/node_modules/puppeteer').executablePath())")"
  export PUPPETEER_EXECUTABLE_PATH
fi

if [ ! -x "$PUPPETEER_EXECUTABLE_PATH" ]; then
  echo "HATA: Chrome bulunamadı veya çalıştırılabilir değil: $PUPPETEER_EXECUTABLE_PATH" >&2
  exit 1
fi

echo "Chrome: $PUPPETEER_EXECUTABLE_PATH"

exec "$@"
