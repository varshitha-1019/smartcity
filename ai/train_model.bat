@echo off
setlocal
cd /d %~dp0\..
python -m pip install -r ai\requirements.txt
if errorlevel 1 pause & exit /b 1
python ai\scripts\audit_dataset.py
if errorlevel 1 pause & exit /b 1
python ai\scripts\train.py
pause
