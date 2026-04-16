@echo off
REM ============================================================================
REM  publish-release.bat
REM
REM  Builds the Windows installer and copies it + latest.json to a releases
REM  folder. Run from the project root:
REM
REM    scripts\publish-release.bat \\server\share\releases
REM
REM  Prerequisites:
REM    - Node.js and npm installed
REM    - npm install already run
REM ============================================================================

if "%~1"=="" (
    echo Usage: scripts\publish-release.bat ^<releases-folder^>
    echo Example: scripts\publish-release.bat \\server\share\releases
    exit /b 1
)

set RELEASES_DIR=%~1

echo.
echo [1/3] Building Windows installer...
call npm run build:win
if errorlevel 1 (
    echo BUILD FAILED
    exit /b 1
)

REM Find the generated .exe installer
for /f "delims=" %%i in ('dir /b /s dist\*.exe 2^>nul') do set INSTALLER=%%i
if "%INSTALLER%"=="" (
    echo ERROR: No .exe found in dist\ after build.
    exit /b 1
)

REM Extract version from package.json
for /f "tokens=2 delims=:, " %%v in ('findstr /c:"\"version\"" package.json') do set VERSION=%%~v
set VERSION=%VERSION:"=%

echo.
echo [2/3] Copying installer to %RELEASES_DIR%...
if not exist "%RELEASES_DIR%" mkdir "%RELEASES_DIR%"
copy /y "%INSTALLER%" "%RELEASES_DIR%\"

REM Get just the filename
for %%f in ("%INSTALLER%") do set INSTALLER_NAME=%%~nxf

echo.
echo [3/3] Writing latest.json...
(
echo {
echo   "version": "%VERSION%",
echo   "file": "%INSTALLER_NAME%"
echo }
) > "%RELEASES_DIR%\latest.json"

echo.
echo ============================================
echo  Published v%VERSION%
echo  Installer: %RELEASES_DIR%\%INSTALLER_NAME%
echo  Manifest:  %RELEASES_DIR%\latest.json
echo ============================================
echo.
echo Users will be prompted to update on their next launch.
