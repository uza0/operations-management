@echo off
setlocal enabledelayedexpansion
title Build the Android app
cd /d "%~dp0"

rem ===========================================================================
rem  Builds TicketZone-Ops.apk from apk\ — no Gradle, no downloads.
rem
rem  Everything it uses is already on this machine: the Android build tools in
rem  D:\Android and the JDK that Git CMD already has on its PATH. That is the
rem  whole point of doing it by hand — a Gradle project would spend ten minutes
rem  fetching a build system to compile one file.
rem ===========================================================================

set "SDK=D:\Android"
set "BT=%SDK%\build-tools\33.0.0"
set "PLATFORM=%SDK%\platforms\android-33\android.jar"
set "SRC=%~dp0apk"
set "OUT=%~dp0apk\build"
set "APK=%~dp0TicketZone-Ops.apk"

echo.
echo  ===========================================================
echo    Building the Android app
echo  ===========================================================
echo.

if not exist "%BT%\aapt2.exe" (
  echo  [X] Build tools not found at:
  echo      %BT%
  echo      Edit the SDK line at the top of this file.
  goto :fail
)
if not exist "%PLATFORM%" (
  echo  [X] android.jar not found at:
  echo      %PLATFORM%
  goto :fail
)

rem --- a clean slate, so a failed run never ships half of itself ------------
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%" 2>nul
mkdir "%OUT%\res" 2>nul
mkdir "%OUT%\classes" 2>nul
mkdir "%OUT%\gen" 2>nul

rem --- the launcher icon, taken from the site's own ------------------------
if not exist "%SRC%\res\mipmap-xxhdpi" mkdir "%SRC%\res\mipmap-xxhdpi"
if exist "%~dp0public\icons\icon-192.png" (
  copy /y "%~dp0public\icons\icon-192.png" "%SRC%\res\mipmap-xxhdpi\ic_launcher.png" >nul
)
if not exist "%SRC%\res\mipmap-xxhdpi\ic_launcher.png" (
  echo  [X] No launcher icon. Expected public\icons\icon-192.png
  goto :fail
)

echo  [1/6] compiling resources...
"%BT%\aapt2.exe" compile --dir "%SRC%\res" -o "%OUT%\res.zip" || goto :fail

echo  [2/6] linking resources...
"%BT%\aapt2.exe" link -o "%OUT%\base.apk" -I "%PLATFORM%" ^
  --manifest "%SRC%\AndroidManifest.xml" "%OUT%\res.zip" ^
  --java "%OUT%\gen" --min-sdk-version 21 --target-sdk-version 33 ^
  --version-code 1 --version-name 1.0 || goto :fail

echo  [3/6] compiling java...
javac -nowarn -encoding UTF-8 -source 11 -target 11 -classpath "%PLATFORM%" ^
  -d "%OUT%\classes" "%SRC%\java\iq\ticketzone\ops\MainActivity.java" || goto :fail

echo  [4/6] converting to dex...
rem  The classes go in as one jar rather than named one by one: an anonymous
rem  inner class is a file nobody writes down, and a list of them goes stale
rem  the first time a listener is added.
jar cf "%OUT%\classes.jar" -C "%OUT%\classes" . || goto :fail
rem  d8.bat and apksigner.bat still launch java with -Djava.ext.dirs, which
rem  Java 9 removed and Java 17 refuses outright. The jars themselves are
rem  fine, so they are run directly.
java -cp "%BT%\lib\d8.jar" com.android.tools.r8.D8 --lib "%PLATFORM%" --min-api 21 --output "%OUT%" "%OUT%\classes.jar" || goto :fail

echo  [5/6] packing and aligning...
rem  aapt appends classes.dex to the archive and leaves every entry that is
rem  already in it exactly as aapt2 wrote it. That matters for one of them:
rem  an app targeting Android 11 or newer is refused at install if its
rem  resources.arsc comes back compressed, and a packer that rewrites the
rem  whole zip is how that happens.
pushd "%OUT%"
if exist "%BT%\aapt.exe" (
  "%BT%\aapt.exe" add -f base.apk classes.dex >nul || (popd ^& goto :fail)
) else (
  jar uf base.apk classes.dex || (popd ^& goto :fail)
)
popd
if exist "%OUT%\aligned.apk" del "%OUT%\aligned.apk"
"%BT%\zipalign.exe" -f 4 "%OUT%\base.apk" "%OUT%\aligned.apk" || goto :fail

rem --- the signing key, made once and kept ---------------------------------
rem  Keep apk\keystore.jks. An update signed with a different key installs as
rem  a different app, and Android refuses to replace one with the other.
if not exist "%SRC%\keystore.jks" (
  echo        making a signing key ^(first run only^)...
  keytool -genkeypair -v -keystore "%SRC%\keystore.jks" -alias ops ^
    -keyalg RSA -keysize 2048 -validity 10000 ^
    -storepass ticketzone -keypass ticketzone ^
    -dname "CN=TicketZone Ops, O=TicketZone, C=IQ" >nul 2>&1 || goto :fail
)

echo  [6/6] signing...
if exist "%APK%" del "%APK%"
java -jar "%BT%\lib\apksigner.jar" sign --ks "%SRC%\keystore.jks" ^
  --ks-pass pass:ticketzone --key-pass pass:ticketzone ^
  --out "%APK%" "%OUT%\aligned.apk" || goto :fail

echo        checking the finished file...
java -jar "%BT%\lib\apksigner.jar" verify --print-certs "%APK%" >nul 2>&1 || goto :fail
"%BT%\aapt.exe" dump badging "%APK%" 2>nul | findstr /b "package: launchable-activity:"

echo.
echo  ===========================================================
echo    Done.  TicketZone-Ops.apk
echo    Send it to the phone, open it, allow install from
echo    this source, and it appears as an app with its own icon.
echo  ===========================================================
echo.
dir /b "%APK%"
goto :done

:fail
echo.
echo  [X] BUILD FAILED — the line above says why.
echo.

:done
pause
