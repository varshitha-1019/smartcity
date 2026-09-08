SMARTCITY AI - CORRECTED CODE PACKAGE
=====================================

Main fix: retrain before final testing.

1) Copy these dataset ZIPs into this project root:
   archive.zip
   garbage.v1i.multiclass.zip
   Drainage.v1i.yolov8.zip
   pipeline_leakage1.v1i.yolov8.zip

2) Run: ai\prepare_dataset.bat
3) Run: ai\train_model.bat
4) Restart backend.
5) Test Garbage, Drainage, Pothole and Water Leakage with fresh citizen-style photos.

Detailed instructions: ai\README_CORRECTED_AI.md

The old .keras files are retained only because they were present in the original project.
The training script replaces production model with the best validation checkpoint.
