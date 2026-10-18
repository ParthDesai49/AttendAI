@echo off
:: Start Backend
start "AttendAI Backend" cmd /k "cd /d C:\Users\parth\Downloads\attendai\attendai\backend && venv\Scripts\activate && uvicorn app.main:app --reload"

:: Start Frontend
start "AttendAI Frontend" cmd /k "cd /d C:\Users\parth\Downloads\attendai\attendai\frontend && npm run dev"

:: Open the app after the servers have started
timeout /t 6 /nobreak >nul
start http://localhost:5173