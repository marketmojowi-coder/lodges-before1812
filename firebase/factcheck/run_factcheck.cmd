@echo off
cd /d "%~dp0"
python factcheck.py --data "%USERPROFILE%\Downloads\app_data.json" --register "%USERPROFILE%\Downloads\fact_register.json" --people "%USERPROFILE%\Downloads\People_Cross_Reference.csv" --out "%USERPROFILE%\Downloads\factcheck_report"
pause
