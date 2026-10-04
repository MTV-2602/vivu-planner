@echo off
title ViVu Planner Dev Manager

set "ROOT_DIR=%~dp0"

:MENU
cls
echo ========================================================
echo        VIVU PLANNER - LOCAL DEV MANAGER
echo ========================================================
echo.
echo   [1] KHOI DONG (Backend 4000 + Frontend 8081)
echo   [2] DUNG HE THONG (Kill cong 4000 + 8081)
echo   [3] KHOI DONG LAI (Restart ca 2)
echo   [0] Thoat
echo.
echo ========================================================
set "choice="
set /p choice="Nhap lua chon cua ban [0-3]: "

if "%choice%"=="1" goto START_DEV
if "%choice%"=="2" goto STOP_DEV
if "%choice%"=="3" goto RESTART_DEV
if "%choice%"=="0" exit
goto MENU

:START_DEV
echo.
echo [1/2] Dang chay Backend tren cong 4000...
start "ViVu Backend Server" cmd /k "cd /d "%ROOT_DIR%backend" && npm run dev"

timeout /t 3 /nobreak > nul

echo [2/2] Dang chay Frontend Expo tren cong 8081 (clear cache)...
start "ViVu Frontend Expo" cmd /k "cd /d "%ROOT_DIR%frontend" && npx expo start --web --clear"

echo.
echo DA KHOI CHAY XONG!
echo - Backend API:  http://localhost:4000
echo - Frontend Web: http://localhost:8081
echo.
pause
goto MENU

:STOP_DEV
echo.
echo Dang tat cac tien trinh tren cong 4000 va 8081...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000 ^| findstr LISTENING') do (
    taskkill /f /t /pid %%a > nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8081 ^| findstr LISTENING') do (
    taskkill /f /t /pid %%a > nul 2>&1
)
taskkill /fi "WINDOWTITLE eq ViVu Backend Server*" /f /t > nul 2>&1
taskkill /fi "WINDOWTITLE eq ViVu Frontend Expo*" /f /t > nul 2>&1

echo.
echo DA TAT SACH SE TOAN BO TIEN TRINH!
echo.
pause
goto MENU

:RESTART_DEV
echo.
echo Dang tat tien trinh cu...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000 ^| findstr LISTENING') do (
    taskkill /f /t /pid %%a > nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8081 ^| findstr LISTENING') do (
    taskkill /f /t /pid %%a > nul 2>&1
)
taskkill /fi "WINDOWTITLE eq ViVu Backend Server*" /f /t > nul 2>&1
taskkill /fi "WINDOWTITLE eq ViVu Frontend Expo*" /f /t > nul 2>&1

timeout /t 1 /nobreak > nul
goto START_DEV
