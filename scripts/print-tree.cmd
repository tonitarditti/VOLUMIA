@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0..") do set "ROOT_DIR=%%~fI"
set "OUT_FILE=%ROOT_DIR%\volumia-tree-report.txt"

echo [VOLUMIA] generating support tree report...
echo [VOLUMIA] output: "%OUT_FILE%"

> "%OUT_FILE%" echo [VOLUMIA] Tree report
>> "%OUT_FILE%" echo Generated: %date% %time%
>> "%OUT_FILE%" echo Root: %ROOT_DIR%
>> "%OUT_FILE%" echo.
>> "%OUT_FILE%" echo ==== tree /f /a ====
tree "%ROOT_DIR%" /f /a >> "%OUT_FILE%"
>> "%OUT_FILE%" echo.
>> "%OUT_FILE%" echo ==== dir /s (size summary) ====
dir "%ROOT_DIR%" /s >> "%OUT_FILE%"

echo [VOLUMIA] report saved.
endlocal
