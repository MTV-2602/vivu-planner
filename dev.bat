@echo off
title ViVu Planner Dev & Android Manager
chcp 65001 > nul
setlocal enabledelayedexpansion

set "ROOT_DIR=%~dp0"
set "EMULATOR_EXE=C:\Users\vinhmt\AppData\Local\Android\Sdk\emulator\emulator.exe"
set "ADB_EXE=C:\Users\vinhmt\AppData\Local\Android\Sdk\platform-tools\adb.exe"
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=C:\Users\vinhmt\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%PATH%"

:MENU
cls
echo ========================================================
echo        VIVU PLANNER - LOCAL DEV ^& MOBILE MANAGER
echo ========================================================
echo.
echo   [1] KHOI DONG WEB       (Backend 4000 + Frontend 8081 Web)
echo   [2] DUNG HE THONG       (Tat toan bo port 4000 va 8081)
echo   [3] KHOI DONG LAI       (Restart ca Backend va Frontend Web)
echo.
echo   ---------------- TEST ANDROID ------------------------
echo   [4] TEST ANDROID        (1-Click chay may ao + backend + live-reload)
echo   [5] BUILD FILE APK      (Xuat file .apk cai dat dien thoai)
echo.
echo   [0] Thoat
echo ========================================================
set "choice="
set /p choice="Nhap lua chon cua ban [0-5]: "

if "%choice%"=="1" goto START_DEV
if "%choice%"=="2" goto STOP_DEV
if "%choice%"=="3" goto RESTART_DEV
if "%choice%"=="4" goto START_ANDROID
if "%choice%"=="5" goto BUILD_APK
if "%choice%"=="6" goto BUILD_APK
if "%choice%"=="0" exit
goto MENU

:START_DEV
echo.
echo [1/2] Dang chay Backend tren cong 4000...
start "ViVu Backend Server" cmd /k "cd /d "%ROOT_DIR%backend" && npm run dev"

ping 127.0.0.1 -n 4 > nul

echo [2/2] Dang chay Frontend Expo tren cong 8081 (clear cache)...
start "ViVu Frontend Expo" cmd /k "cd /d "%ROOT_DIR%frontend" && npx expo start --clear"

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
taskkill /fi "WINDOWTITLE eq ViVu Android Expo*" /f /t > nul 2>&1

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
taskkill /fi "WINDOWTITLE eq ViVu Android Expo*" /f /t > nul 2>&1

ping 127.0.0.1 -n 2 > nul
goto START_DEV

:START_ANDROID
call "%ROOT_DIR%test_android.bat"
goto MENU

:BUILD_APK
cls
echo ========================================================
echo             BUILD FILE APK VIVU PLANNER
echo ========================================================
echo.
echo   [1] Build qua EAS Cloud (Khuyen dung - Link tai truc tiep)
echo   [2] Build truc tiep Local tren may tinh (Dung JBR va Android SDK)
echo   [0] Quay lai Menu chinh
echo ========================================================
set "apk_choice="
set /p apk_choice="Nhap lua chon [0-2]: "

if "%apk_choice%"=="1" (
    echo.
    echo ========================================================
    echo Dang bat dau build APK qua Expo EAS Cloud...
    echo Profile: preview (xuat file .apk doc lap cai dien thoai)
    echo ========================================================
    cd /d "%ROOT_DIR%frontend"
    call npx eas-cli build --platform android --profile preview
    echo.
    pause
    goto MENU
)
if "%apk_choice%"=="2" (
    echo.
    echo ========================================================
    echo Dang bat dau build Local APK tren may tinh...
    echo ========================================================
    cd /d "%ROOT_DIR%frontend"
    call npx eas-cli build --platform android --profile preview --local
    echo.
    pause
    goto MENU
)
goto MENU
