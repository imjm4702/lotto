@echo off
setlocal
cd /d "%~dp0"

node publish.js
set "DEPLOY_EXIT_CODE=%ERRORLEVEL%"

if not "%DEPLOY_EXIT_CODE%"=="0" echo Deployment failed. Review the message above.
pause
exit /b %DEPLOY_EXIT_CODE%
