@echo off
title Employee Records Management System - Dedicated Server
color 0A

echo =================================================================
echo   EMPLOYEE RECORDS MANAGEMENT SYSTEM (ERMS) - DEDICATED SERVER
echo =================================================================
echo.
echo  Starting backend server on port 5000...
echo  Press Ctrl+C to stop the server.
echo.

cd /d "%~dp0server"

:LOOP
echo [%date% %time%] Launching server process...
call npm run dev
echo.
echo [%date% %time%] Server process stopped or restarted. Re-launching in 3 seconds...
timeout /t 3 /nobreak >nul
goto LOOP
