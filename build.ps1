Write-Host "=== LeadPin Desktop Build ===" -ForegroundColor Cyan

# 1. Cargo PATH
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

# 2. Backend: TypeScript compile
Write-Host "`n[1/4] Backend TypeScript derleniyor..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\backend"
npm install
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Backend build hatasi!" -ForegroundColor Red; exit 1 }

# 3. Backend: pkg ile exe olustur
Write-Host "`n[2/4] Backend exe olarak paketleniyor..." -ForegroundColor Yellow
npx @yao-pkg/pkg dist/index.js --targets node18-win-x64 --output ../src-tauri/binaries/backend-x86_64-pc-windows-msvc --compress GZip
if ($LASTEXITCODE -ne 0) { Write-Host "pkg hatasi!" -ForegroundColor Red; exit 1 }

# 4. Frontend + Tauri build
Write-Host "`n[3/4] Frontend derleniyor..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot"
npm install
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Frontend build hatasi!" -ForegroundColor Red; exit 1 }

Write-Host "`n[4/4] Tauri installer olusturuluyor..." -ForegroundColor Yellow
npm run tauri:build
if ($LASTEXITCODE -ne 0) { Write-Host "Tauri build hatasi!" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Build tamamlandi! ===" -ForegroundColor Green
Write-Host "Setup dosyasi: desktop\src-tauri\target\release\bundle\nsis\LeadPin_*.exe" -ForegroundColor Green
