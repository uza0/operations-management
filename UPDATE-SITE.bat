@echo off
chcp 65001 >nul
title Update the live site
cd /d "%~dp0"

rem ---------------------------------------------------------------------------
rem  One double-click: send the new code to GitHub, wait for Vercel to build,
rem  then open the one-time setup link that adds any new database columns.
rem
rem  The setup link keeps your data. It only ever wipes it if "&reset=1" is on
rem  the end, and it is not.
rem ---------------------------------------------------------------------------

set SITE=https://operations-management-two.vercel.app
set SETUP=%SITE%/api/setup?key=b31ce86266d89048268350e9f1a14f0c

echo.
echo   Step 1 of 3  —  sending the code to GitHub
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo   [X] Git is not installed.  https://git-scm.com/download/win
  pause
  exit /b 1
)

git config user.email "99142383+uza0@users.noreply.github.com"
git config user.name "uza0"

git remote remove origin >nul 2>&1
git remote add origin https://github.com/uza0/operations-management.git

git add -A
git commit -m "Light theme, send-to-everyone run, official WhatsApp Cloud API, gate leader in the briefing" >nul 2>&1

echo   A browser window may open asking you to sign in. Approve it.
echo.
git push -u origin main --force
if errorlevel 1 goto fail

echo.
echo   Step 2 of 3  —  waiting for Vercel to build (about 90 seconds)
echo.
timeout /t 90 /nobreak

echo.
echo   Step 3 of 3  —  opening the setup link, then the site
echo.
start "" "%SETUP%"
timeout /t 8 /nobreak >nul
start "" "%SITE%/admin/events"

echo.
echo   ============================================================
echo     Done.
echo     The first tab should show  "status":"already-set-up"
echo     The second tab is your events — open one, then "Distribution board".
echo   ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo   [X] The push failed. Copy this window and send it.
echo.
pause
exit /b 1
