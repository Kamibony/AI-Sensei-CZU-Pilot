# Tento skript spouští kompletní vývojové prostředí pro AI Sensei

Write-Host "🚀 Spouštím vývojové prostředí pro AI Sensei..." -ForegroundColor Green

# Nastaví proměnnou prostředí pro Firestore emulátor na port 8081
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8081"
Write-Host "✅ Nastavena proměnná pro emulátor: FIRESTORE_EMULATOR_HOST=127.0.0.1:8081"

# Spustí Firebase emulátory v novém okně terminálu
Start-Process powershell -ArgumentList "-NoExit", "-Command", "firebase emulators:start"
Write-Host "⏳ Čekám 15 sekund, než se emulátory plně spustí..."

# Počká 15 sekund, aby se emulátory stihly inicializovat
Start-Sleep -Seconds 15

# Spustí skript pro naplnění databáze
Write-Host "🌱 Plním lokální databázi vzorovými daty..."
node seed_database.js

Write-Host "✅ Hotovo! Vývojové prostředí je připraveno na http://localhost:5000" -ForegroundColor Green
Write-Host "Můžete začít pracovat. Toto okno můžete zavřít."