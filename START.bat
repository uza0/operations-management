@echo off
chcp 65001 >nul
title Operations Management
cd /d "%~dp0"
color 0F

echo.
echo  ===========================================================
echo    OPERATIONS MANAGEMENT  -  Event ^& Gate Operations
echo  ===========================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js is not installed on this computer.
  echo       Install it from https://nodejs.org  ^(LTS version^)
  echo       then run this file again.
  echo.
  pause
  exit /b 1
)

rem ---------- 1. dependencies ----------
if not exist "node_modules\next" (
  echo   [1/4] Installing packages... this can take 1-2 minutes
  call npm install --no-audit --no-fund
  if errorlevel 1 goto fail
) else (
  echo   [1/4] Packages ready
)

rem ---------- 2. settings ----------
if not exist ".env" (
  echo   [2/4] Creating .env with a fresh secret key
  node -e "const fs=require('fs'),c=require('crypto');let s=fs.readFileSync('.env.example','utf8');s=s.replace(/^AUTH_SECRET=.*$/m,'AUTH_SECRET='+c.randomBytes(48).toString('hex'));fs.writeFileSync('.env',s);"
  if errorlevel 1 goto fail
) else (
  echo   [2/4] Settings ready
)

rem ---------- 3. database + demo data ----------
if not exist "data\ops.db" (
  echo   [3/4] Building the database and loading the demo event...
  call npm run setup
  if errorlevel 1 goto fail
) else (
  echo   [3/4] Database ready
)

rem ---------- 4. production build ----------
rem Rebuild when any source file is newer than the last build, so an updated
rem file never runs against a stale build.
set NEEDBUILD=0
if not exist ".next\BUILD_ID" set NEEDBUILD=1
if exist ".next\BUILD_ID" (
  node -e "const fs=require('fs'),p=require('path');function w(d){let t=0;for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);t=Math.max(t,e.isDirectory()?w(f):fs.statSync(f).mtimeMs)}return t}const newest=Math.max(w('src'),fs.statSync('package.json').mtimeMs);process.exit(newest>fs.statSync('.next/BUILD_ID').mtimeMs?1:0)"
  if errorlevel 1 set NEEDBUILD=1
)
if "%NEEDBUILD%"=="1" (
  echo   [4/4] Building the app... this can take a minute
  call npm run build
  if errorlevel 1 goto fail
) else (
  echo   [4/4] Build ready
)

for /f "usebackq delims=" %%i in (`node -e "const n=require('os').networkInterfaces();let ip='';for(const k in n)for(const a of n[k])if(a.family==='IPv4'&&!a.internal&&!ip)ip=a.address;console.log(ip||'localhost')"`) do set "LANIP=%%i"

echo.
echo  ===========================================================
echo    On this computer :  http://localhost:3000
echo    On your phone    :  http://%LANIP%:3000     ^(same Wi-Fi^)
echo  -----------------------------------------------------------
echo    admin    / Admin@12345      full access
echo    ahmed    / Leader@12345     team leader
echo    hussein  / Gate@12345       gate leader (Gate 3)
echo  -----------------------------------------------------------
echo    Keep this window OPEN while using the app.
echo    Press Ctrl+C  (or close the window) to stop it.
echo  ===========================================================
echo.

start /b "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 6; Start-Process 'http://localhost:3000/login'" >nul 2>&1

call npm run start
goto end

:fail
echo.
echo   [X] Something went wrong in the step above.
echo       Take a screenshot of this window and send it.
echo.
pause
exit /b 1

:end
echo.
echo   Server stopped.
pause
