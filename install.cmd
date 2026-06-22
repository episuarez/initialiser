@echo off
setlocal
REM Instala init-claude como comando global. Prefiere git clone (auto-actualizable
REM con `init-claude update`). Sin git, cae a xcopy (sin auto-update).

set "DEST=%LOCALAPPDATA%\init-claude"
set "REPO=https://github.com/episuarez/initialiser.git"

where git >nul 2>&1
if errorlevel 1 (
  echo Git no encontrado. Instalando por copia ^(sin auto-update^).
  goto xcopy
)

if exist "%DEST%\.git" (
  echo Clon existente. Actualizando...
  git -C "%DEST%" pull
  goto deps
)
if exist "%DEST%" (
  echo Carpeta existente sin git ^(xcopy antiguo^); reconvirtiendo a clon...
  rmdir /S /Q "%DEST%"
)
echo Clonando en %DEST% ...
git clone --depth 1 "%REPO%" "%DEST%"
goto deps

:xcopy
if not exist "%DEST%" mkdir "%DEST%"
xcopy /E /Y /Q "%~dp0*" "%DEST%\" >nul

:deps
pushd "%DEST%"
call npm install --omit=dev --silent
popd

powershell -NoProfile -Command ^
  "$d='%DEST%'; $p=[Environment]::GetEnvironmentVariable('Path','User');" ^
  "if ($p -notlike ('*'+$d+'*')) { [Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';')+';'+$d), 'User'); Write-Host 'PATH actualizado.' } else { Write-Host 'Ya en PATH.' }"

echo.
echo Listo. Nueva terminal y ejecuta:  init-claude
echo Para actualizar:  init-claude update
pause
