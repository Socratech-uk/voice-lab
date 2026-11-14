@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 tools\audio_storage.py %*
) else (
  python tools\audio_storage.py %*
)
pause
