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

rem GitHub must recognise the commit author, otherwise Vercel refuses to build
rem the push ("commit email could not be matched to a GitHub account"). This is
rem the account's own no-reply address: it always matches, and it keeps the real
rem address out of public commit metadata.
git config user.email "99142383+uza0@users.noreply.github.com"
git config user.name "uza0"

git remote remove origin >nul 2>&1
git remote add origin https://github.com/uza0/operations-management.git

git add -A
git commit -m "Operations Management - event team and gate operations platform" >nul 2>&1
if errorlevel 1 goto amend

echo.
echo   Pushing... a browser window may open asking you to sign in to GitHub.
echo   Approve it and this will continue on its own.
echo.
git push -u origin main
if errorlevel 1 goto fail
goto done

:amend
rem Nothing new to commit. Re-stamp the last commit with the correct author so
rem the hosting side will accept it, then replace it on the remote.
echo   (no new changes - refreshing the last commit's author)
git commit --amend --reset-author --no-edit >nul 2>&1
echo.
echo   Pushing... a browser window may open asking you to sign in to GitHub.
echo   Approve it and this will continue on its own.
echo.
git push -u origin main --force-with-lease
if errorlevel 1 goto fail

:done

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
