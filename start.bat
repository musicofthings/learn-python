@echo off
REM HelixBench launcher for Windows
cd /d "%~dp0"

where py >nul 2>&1 && (
  py -3 start.py %*
  exit /b %ERRORLEVEL%
)
where python >nul 2>&1 && (
  python start.py %*
  exit /b %ERRORLEVEL%
)
where python3 >nul 2>&1 && (
  python3 start.py %*
  exit /b %ERRORLEVEL%
)

echo ERROR: Python not found. Install Python 3 from https://www.python.org/downloads/
exit /b 1
