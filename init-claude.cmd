@echo off
REM Shim init-claude: auto-bootstrap (npm install en primer uso) + ejecucion.
setlocal
set "APPDIR=%~dp0"
if not exist "%APPDIR%node_modules" (
  echo Primera ejecucion: instalando dependencias...
  pushd "%APPDIR%"
  call npm install --omit=dev --silent
  popd
)
node "%APPDIR%bin\init-claude.mjs" %*
