@echo off
title ViVu Planner - Build APK Android
chcp 65001 > nul
setlocal enabledelayedexpansion

set "ROOT_DIR=%~dp0"
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=C:\Users\vinhmt\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%PATH%"

echo ========================================================
echo        XUAT FILE APK CAI DAT CHO DIEN THOAI ANDROID
echo ========================================================
echo.
echo   [1] Build APK Cloud qua EAS (Khuyen dung - Server Expo build, co link va QR tai APK truc tiep)
echo   [2] Build Local tren may tinh (Dung JBR va Android SDK local)
echo   [0] Thoat
echo.
echo ========================================================
set "apk_choice="
set /p apk_choice="Nhap lua chon cua ban [0-2]: "

if "%apk_choice%"=="1" (
    echo.
    echo ========================================================
    echo Dang bat dau build APK qua Expo EAS Cloud...
    echo Profile: preview (tao file .apk cai truc tiep)
    echo ========================================================
    cd /d "%ROOT_DIR%frontend"
    call npx eas-cli build --platform android --profile preview
    echo.
    pause
    exit
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
    exit
)
exit
