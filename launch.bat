@echo off
setlocal EnableDelayedExpansion

REM ============================================================================
REM  Contract Manager - Auto-Updating Launcher
REM ----------------------------------------------------------------------------
REM  Double-click this file to launch the app. On every start it will:
REM    1. Check GitHub for updates to the current branch
REM    2. Pull them automatically if any are found
REM    3. Reinstall dependencies (only if package-lock.json changed)
REM    4. Rebuild the app (only if source code changed)
REM    5. Launch the app
REM
REM  Requirements: Git and Node.js (npm) must be installed and on PATH.
REM ============================================================================

REM ------------------------- Configuration ------------------------------------
REM  LAUNCH_MODE:
REM    prod = build the app, then run it (default; behaves like an installed app)
REM    dev  = run the Vite dev server with hot reload (for development)
set "LAUNCH_MODE=prod"

REM  BRANCH: which branch to track. "auto" uses whatever branch is checked out.
set "BRANCH=auto"

REM  Set to 1 to skip the update check entirely (offline / fast launch).
set "SKIP_UPDATE=0"
REM ----------------------------------------------------------------------------

REM Always operate from the folder this script lives in, so double-clicking works.
cd /d "%~dp0"

echo(
echo ===============================================
echo   Contract Manager Launcher
echo ===============================================
echo(

REM --- Verify required tools are available ------------------------------------
where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed or not on your PATH.
    echo         Install it from https://git-scm.com/download/win and try again.
    goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js / npm is not installed or not on your PATH.
    echo         Install it from https://nodejs.org/ and try again.
    goto :fail
)

REM --- Make sure we are inside a git working copy -----------------------------
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [ERROR] This folder is not a Git checkout, so updates cannot be fetched.
    echo         Clone the repository with Git instead of downloading a ZIP.
    goto :fail
)

set "UPDATED=0"

if "%SKIP_UPDATE%"=="1" (
    echo [1/4] Skipping update check ^(SKIP_UPDATE=1^).
    goto :after_update
)

REM --- Resolve which branch to track ------------------------------------------
if /i "%BRANCH%"=="auto" (
    for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
)
if "%BRANCH%"=="HEAD" (
    echo [WARN] Repository is in a detached HEAD state; cannot auto-update.
    goto :after_update
)

echo [1/4] Checking GitHub for updates on branch "!BRANCH!"...

REM --- Fetch remote refs (retry a few times on transient network errors) ------
set "FETCH_OK=0"
for %%i in (1 2 3) do (
    if "!FETCH_OK!"=="0" (
        git fetch origin "!BRANCH!" >nul 2>&1
        if not errorlevel 1 (
            set "FETCH_OK=1"
        ) else (
            echo       ...network hiccup, retrying ^(%%i/3^)
            REM brief backoff
            ping -n 3 127.0.0.1 >nul 2>&1
        )
    )
)

if "!FETCH_OK!"=="0" (
    echo [WARN] Could not reach GitHub. Launching the current local version.
    goto :after_update
)

REM --- Compare local vs remote commit -----------------------------------------
set "LOCAL_REV="
set "REMOTE_REV="
for /f "delims=" %%a in ('git rev-parse HEAD 2^>nul') do set "LOCAL_REV=%%a"
for /f "delims=" %%a in ('git rev-parse "origin/!BRANCH!" 2^>nul') do set "REMOTE_REV=%%a"

if "!LOCAL_REV!"=="!REMOTE_REV!" (
    echo       Already up to date.
    goto :after_update
)

echo       Update found. Downloading latest changes...

REM Record the lockfile fingerprint before pulling so we know if deps changed.
set "LOCK_BEFORE="
for /f "delims=" %%a in ('git rev-parse "HEAD:package-lock.json" 2^>nul') do set "LOCK_BEFORE=%%a"

git pull --ff-only origin "!BRANCH!"
if errorlevel 1 (
    echo [WARN] Automatic update failed ^(local changes may conflict^).
    echo        Launching the current local version instead.
    goto :after_update
)

set "UPDATED=1"
echo       Update complete.

REM Did the lockfile change as part of this update?
set "LOCK_AFTER="
for /f "delims=" %%a in ('git rev-parse "HEAD:package-lock.json" 2^>nul') do set "LOCK_AFTER=%%a"

:after_update
echo(

REM --- Install dependencies when needed ---------------------------------------
set "NEED_INSTALL=0"
if not exist "node_modules" set "NEED_INSTALL=1"
if not "!LOCK_BEFORE!"=="!LOCK_AFTER!" set "NEED_INSTALL=1"

if "!NEED_INSTALL!"=="1" (
    echo [2/4] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed.
        goto :fail
    )
) else (
    echo [2/4] Dependencies up to date.
)
echo(

REM --- Launch -----------------------------------------------------------------
if /i "%LAUNCH_MODE%"=="dev" (
    echo [3/4] Build step skipped ^(dev mode^).
    echo [4/4] Starting Contract Manager ^(development mode^)...
    echo(
    call npm run dev
    goto :done
)

REM Production mode: build if code changed or no prior build exists.
set "NEED_BUILD=0"
if not exist "out\main\index.js" set "NEED_BUILD=1"
if "!UPDATED!"=="1" set "NEED_BUILD=1"

if "!NEED_BUILD!"=="1" (
    echo [3/4] Building the app...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Build failed.
        goto :fail
    )
) else (
    echo [3/4] Existing build is current.
)
echo(

echo [4/4] Starting Contract Manager...
echo(
call npm run preview
goto :done

:fail
echo(
echo Launch aborted. See the message above.
echo(
pause
endlocal
exit /b 1

:done
endlocal
exit /b 0
