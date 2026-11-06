@echo off
cd /d "%~dp0"
echo Abriendo http://localhost:8000 ...
start "" http://localhost:8000
python servidor.py 8000
