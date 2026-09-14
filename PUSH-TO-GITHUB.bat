@echo off
chcp 65001 >nul
title Upload to GitHub
cd /d "%~dp0"

echo.
echo   Uploading the project to  github.com/uza0/operations-management
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo   [X] Git is not installed.
  echo       Install it from  https://git-scm.com/download/win
  echo       then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist ".git" (
  git init
  git branch -M main
)

git config user.email "amego22117@gmail.com"
git config user.name "uza0"

git remote remove origin >nul 2>&1
git remote add origin https://github.com/uza0/operations-management.git

git add -A
git commit -m "Operations Management - event team and gate operations platform" >nul 2>&1
if errorlevel 1 echo   (nothing new to commit - pushing what is already committed)

echo.
echo   Pushing... a browser window may open asking you to sign in to GitHub.
echo   Approve it and this will continue on its own.
echo.
git push -u origin main
if errorlevel 1 goto fail

echo.
echo   ============================================================
echo     Done. The code is now at
echo     https://github.com/uza0/operations-management
echo   ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo   [X] The push failed. Take a screenshot of this window and send it.
echo.
pause
exit /b 1
