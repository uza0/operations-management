@echo off
chcp 65001 >nul
title Upload to GitHub
cd /d "%~dp0"

echo.
echo   Uploading to  github.com/uza0/operations-management
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
git commit -m "Operations Management - event team and gate operations platform" >nul 2>&1

rem Your computer holds the real version. An earlier attempt rewrote the last
rem commit locally, so the remote no longer shares history with it - a plain
rem push can never fast-forward past that. Replace the remote branch outright.
echo   Pushing (this replaces the copy on GitHub with the one on this computer)...
echo   A browser window may open asking you to sign in. Approve it.
echo.
git push -u origin main --force
if errorlevel 1 goto fail

echo.
echo   ============================================================
echo     Done. Vercel starts building within a few seconds.
echo     https://github.com/uza0/operations-management
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
