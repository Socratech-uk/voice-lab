@echo off
setlocal
pushd "%~dp0"
if defined CAPP_SUITE_PYTHON goto configured
where py.exe >nul 2>nul
if not errorlevel 1 goto pylauncher
where python.exe >nul 2>nul
if not errorlevel 1 goto python
 echo Python 3.10 or newer is needed for the creative suite exporter.
 echo Install Python or set CAPP_SUITE_PYTHON to an existing python.exe.
set "suite_zip_exit=1"
goto finish
:configured
"%CAPP_SUITE_PYTHON%" "%~dp0tools\creative_suite.py" --root "%~dp0." %*
goto result
:pylauncher
py.exe -3 "%~dp0tools\creative_suite.py" --root "%~dp0." %*
goto result
:python
python.exe "%~dp0tools\creative_suite.py" --root "%~dp0." %*
:result
set "suite_zip_exit=%ERRORLEVEL%"
:finish
popd
if not "%CAPP_ZIP_NO_PAUSE%"=="1" pause
exit /b %suite_zip_exit%
