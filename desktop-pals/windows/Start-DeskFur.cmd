@echo off
setlocal
title DeskFur
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
set "DESKFUR_EXIT=%ERRORLEVEL%"
if not "%DESKFUR_EXIT%"=="0" (
  echo.
  echo DeskFur could not start. The details above explain what happened.
  echo Keep this window open if you need to copy the error.
  pause
)
exit /b %DESKFUR_EXIT%
