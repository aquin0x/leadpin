#!/usr/bin/env bash
# LeadPin Desktop — Mac/Linux build script
# Çalıştırılacağı OS = hedef OS. Mac'te .dmg, Linux'ta .deb/.AppImage üretir.
set -euo pipefail

cyan()   { printf '\033[1;36m%s\033[0m\n' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }
green()  { printf '\033[1;32m%s\033[0m\n' "$*"; }
red()    { printf '\033[1;31m%s\033[0m\n' "$*" 1>&2; }

cyan "=== LeadPin Desktop Build ==="

# 1. Cargo PATH (rustup default location)
export PATH="$HOME/.cargo/bin:$PATH"

# 2. Hedef OS + arch tespit → pkg target ve Tauri triple eşle
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  PKG_TARGET="node18-macos-arm64";  TRIPLE="aarch64-apple-darwin"  ;;
      x86_64) PKG_TARGET="node18-macos-x64";    TRIPLE="x86_64-apple-darwin"   ;;
      *) red "Desteklenmeyen Mac mimarisi: $ARCH"; exit 1 ;;
    esac
    BUNDLE_HINT="src-tauri/target/release/bundle/dmg/*.dmg"
    ;;
  Linux)
    case "$ARCH" in
      x86_64)  PKG_TARGET="node18-linux-x64";   TRIPLE="x86_64-unknown-linux-gnu"  ;;
      aarch64) PKG_TARGET="node18-linux-arm64"; TRIPLE="aarch64-unknown-linux-gnu" ;;
      *) red "Desteklenmeyen Linux mimarisi: $ARCH"; exit 1 ;;
    esac
    BUNDLE_HINT="src-tauri/target/release/bundle/{deb,appimage}/*"
    ;;
  *)
    red "Bu script Mac/Linux içindir. Windows için build.ps1 kullan."
    exit 1
    ;;
esac

cyan "Hedef: $OS/$ARCH  →  pkg=$PKG_TARGET  triple=$TRIPLE"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# 3. Backend: TypeScript compile
yellow "[1/4] Backend TypeScript derleniyor..."
cd "$ROOT_DIR/backend"
npm install
npm run build

# 4. Backend: pkg ile sidecar binary
yellow "[2/4] Backend sidecar binary üretiliyor ($TRIPLE)..."
SIDECAR_OUT="../src-tauri/binaries/backend-$TRIPLE"
npx @yao-pkg/pkg dist/index.js \
  --targets "$PKG_TARGET" \
  --output "$SIDECAR_OUT" \
  --compress GZip
chmod +x "$SIDECAR_OUT"

# 5. Frontend
yellow "[3/4] Frontend derleniyor..."
cd "$ROOT_DIR"
npm install
npm run build

# 6. Tauri bundle
yellow "[4/4] Tauri bundle oluşturuluyor..."
npm run tauri:build

green ""
green "=== Build tamamlandı ==="
green "Çıktı: $BUNDLE_HINT"
