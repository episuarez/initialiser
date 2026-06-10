@echo off
setlocal
REM Instala init-claude como comando global (sin instalador real: copia + PATH).
REM Si prefieres auto-update: en vez de ejecutar esto, clona tu repo en
REM %LOCALAPPDATA%\init-claude y añade esa carpeta al PATH; update = git pull.

set "DEST=%LOCALAPPDATA%\init-claude"
echo Instalando en %DEST% ...
if not exist "%DEST%" mkdir "%DEST%"
xcopy /E /Y /Q "%~dp0*" "%DEST%\" >nul

powershell -NoProfile -Command ^
  "$d='%DEST%'; $p=[Environment]::GetEnvironmentVariable('Path','User');" ^
  "if ($p -notlike ('*'+$d+'*')) { [Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';')+';'+$d), 'User'); Write-Host 'PATH actualizado.' } else { Write-Host 'Ya en PATH.' }"

echo.
echo Listo. Nueva terminal y ejecuta:  init-claude
pause
