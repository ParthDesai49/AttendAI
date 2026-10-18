@echo off
:: Change the folder below if you move the project.
set ROOT=C:\Users\parth\Downloads\attendai\attendai

start "AttendAI Backend" cmd /k "cd /d %ROOT%\backend && venv\Scripts\activate && uvicorn app.main:app --reload"
start "AttendAI Frontend" cmd /k "cd /d %ROOT%\frontend && npm run dev"

timeout /t 6 /nobreak >nul
start http://localhost:5173
