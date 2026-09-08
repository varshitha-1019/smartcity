@echo off
setlocal
cd /d %~dp0\..
python ai\scripts\prepare_dataset.py ^
  --pothole "archive.zip" ^
  --garbage "garbage.v1i.multiclass.zip" ^
  --drainage "Drainage.v1i.yolov8.zip" ^
  --water "pipeline_leakage1.v1i.yolov8.zip" ^
  --output "ai\dataset_final" ^
  --overwrite
if errorlevel 1 pause & exit /b 1
python ai\scripts\audit_dataset.py
pause
