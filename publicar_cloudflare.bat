@echo off
cd /d "%~dp0"
python preparar_cloudflare.py || (pause & exit /b 1)
npx wrangler pages deploy dist --project-name minimundos
pause
