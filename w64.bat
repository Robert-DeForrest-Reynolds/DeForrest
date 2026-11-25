@echo off
setlocal
set "CURRENT_DIR=%CD%"
cd /d "%~dp0"
set "PATH=%~dp0w64devkit\bin;%PATH%"
cd %CURRENT_DIR%
ECHO Make Directory: %CURRENT_DIR%
make %*
endlocal
