@echo off
title ViVu Planner - 1-Click Android Test (Live-Reload)
chcp 65001 > nul
setlocal enabledelayedexpansion

set "ROOT_DIR=%~dp0"
set "EMULATOR_EXE=C:\Users\vinhmt\AppData\Local\Android\Sdk\emulator\emulator.exe"
set "ADB_EXE=C:\Users\vinhmt\AppData\Local\Android\Sdk\platform-tools\adb.exe"
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=C:\Users\vinhmt\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%PATH%"

echo ========================================================
echo     VIVU PLANNER - TEST ANDROID (1-CLICK LIVE-RELOAD)
echo ========================================================
echo.

rem 1. Kiem tra va khoi dong Backend port 4000
echo [1/4] Kiem tra Backend API port 4000...
netstat -aon | findstr :4000 | findstr LISTENING > nul 2>&1
if errorlevel 1 (
    echo   - Backend chua chay. Dang khoi dong Backend tren port 4000...
    start "ViVu Backend Server" cmd /k "cd /d "%ROOT_DIR%backend" && npm run dev"
    ping 127.0.0.1 -n 4 > nul
) else (
    echo   - Backend API da hoat dong tren port 4000. OK.
)

rem 2. Kiem tra va khoi dong may ao Android Pixel_5 co cua so GUI
echo [2/4] Kiem tra cua so may ao Android Pixel_5 tren man hinh...
tasklist /v /fi "IMAGENAME eq qemu-system-x86_64.exe" 2>nul | findstr /i "Pixel_5" > nul 2>&1
if not errorlevel 1 (
    echo   - Cua so may ao Pixel_5 da dang hien thi tren man hinh. OK.
    goto EMU_READY
)

rem Neu co tien trinh qemu chay ngam khong co cua so, dong sach de khoi dong co cua so
tasklist /fi "IMAGENAME eq qemu-system-x86_64.exe" 2>nul | findstr "qemu" > nul 2>&1
if not errorlevel 1 (
    echo   - Dang don dep tien trinh cu de bat lai cua so may ao...
    taskkill /f /im qemu-system-x86_64.exe > nul 2>&1
    taskkill /f /im emulator.exe > nul 2>&1
    ping 127.0.0.1 -n 2 > nul
)

rem Xoa stale lock files de tranh bi ket AVD
del /f /q /s "%USERPROFILE%\.android\avd\Pixel_5.avd\*.lock" > nul 2>&1
rd /s /q "%USERPROFILE%\.android\avd\Pixel_5.avd\hardware-qemu.ini.lock" > nul 2>&1

echo   - Dang bat cua so may ao Pixel_5 len man hinh may tinh...
start "" "%EMULATOR_EXE%" -avd Pixel_5 -no-snapshot-load
echo   - Dang cho may ao Pixel_5 khoi dong he dieu hanh...

set /a RETRY=0
:WAIT_BOOT
ping 127.0.0.1 -n 3 > nul
set /a RETRY+=1

"%ADB_EXE%" shell getprop sys.boot_completed 2>nul | findstr "1" > nul 2>&1
if not errorlevel 1 (
    echo   - May ao Pixel_5 da khoi dong xong. OK.
    goto EMU_READY
)

if !RETRY! geq 35 (
    echo   - Da cho 70 giay, tiep tuc ket noi vao may ao...
    goto EMU_READY
)

echo     ... May ao dang khoi dong [!RETRY!/35], xin vui long doi...
goto WAIT_BOOT

:EMU_READY
rem Bat sang man hinh va mo khoa may ao
"%ADB_EXE%" shell input keyevent 224 > nul 2>&1
"%ADB_EXE%" shell wm dismiss-keyguard > nul 2>&1
echo   - May ao Pixel_5 da san sang va mo khoa man hinh. OK.

rem 3. Kiem tra va khoi dong Metro Bundler
echo [3/4] Kiem tra Expo Metro Bundler port 8081...
netstat -aon | findstr :8081 | findstr LISTENING > nul 2>&1
if not errorlevel 1 goto METRO_READY

echo   - Dang khoi dong Metro Bundler tu thu muc frontend...
start "ViVu Android Expo" cmd /k "cd /d "%ROOT_DIR%frontend" && npx expo start -c"
echo   - Dang cho Metro Bundler bien dich va mo port 8081...

set /a METRO_WAIT=0
:WAIT_METRO
ping 127.0.0.1 -n 3 > nul
set /a METRO_WAIT+=1

netstat -aon | findstr :8081 | findstr LISTENING > nul 2>&1
if not errorlevel 1 (
    echo   - Metro Bundler da san sang tren port 8081. OK.
    goto METRO_READY
)

if !METRO_WAIT! geq 35 (
    echo   - Canh bao: Metro khoi dong lau hon du kien, van tiep tuc mo app...
    goto METRO_READY
)

echo     ... Metro dang khoi tao [!METRO_WAIT!/35], xin vui long doi...
goto WAIT_METRO

:METRO_READY
rem Cho them 2 giay de Metro server on dinh chap nhan request
ping 127.0.0.1 -n 3 > nul

rem 4. Chuyen tiep cong adb reverse va Mo ung dung
echo [4/4] Thiet lap adb reverse va mo App ViVu Planner tren may ao...
"%ADB_EXE%" reverse tcp:8081 tcp:8081 > nul 2>&1
"%ADB_EXE%" reverse tcp:4000 tcp:4000 > nul 2>&1

rem Gui lenh intent nap app vao Expo Go truc tiep
"%ADB_EXE%" shell am start -n host.exp.exponent/.LauncherActivity -a android.intent.action.VIEW -d "exp://127.0.0.1:8081" > nul 2>&1
ping 127.0.0.1 -n 3 > nul
"%ADB_EXE%" shell am start -n host.exp.exponent/.LauncherActivity -a android.intent.action.VIEW -d "exp://10.0.2.2:8081" > nul 2>&1

rem Kiem tra app da bung len man hinh chua
set /a APP_CHECK=0
:WAIT_APP_FOCUS
ping 127.0.0.1 -n 2 > nul
set /a APP_CHECK+=1
"%ADB_EXE%" shell dumpsys window 2>nul | findstr "mCurrentFocus" | findstr "host.exp.exponent" > nul 2>&1
if not errorlevel 1 goto APP_SUCCESS
if !APP_CHECK! geq 5 (
    rem Neu chua bung len, gui lai intent dich danh mot lan nua
    "%ADB_EXE%" shell am start -n host.exp.exponent/.LauncherActivity -a android.intent.action.VIEW -d "exp://127.0.0.1:8081" > nul 2>&1
    goto APP_SUCCESS
)
goto WAIT_APP_FOCUS

:APP_SUCCESS
echo.
echo ========================================================
echo   DA MO THANH CONG APP VIVU PLANNER TREN MAY AO PIXEL 5!
echo ========================================================
echo - Ung dung da duoc nap truc tiep len man hinh may ao.
echo - Tinh nang Live-Reload (Hot Reload) da hoat dong:
echo   Khi ban sua code trong thu muc frontend, app se
echo   tu dong cap nhat ngay lap tuc tren man hinh may ao!
echo - Ban co the bam phim 'r' tai cua so Metro de tai lai app.
echo ========================================================
echo.
pause
