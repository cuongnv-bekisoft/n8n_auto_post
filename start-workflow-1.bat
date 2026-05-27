@echo off

:: Khởi động n8n ở background
start "n8n" cmd /k "yarn n8n"

:: Chờ n8n khởi động xong (30 giây)
timeout /t 30 /nobreak

:: Gọi webhook kích hoạt workflow #1 luôn
curl -s http://localhost:5678/webhook/start-workflow-1

:: Giữ cửa sổ n8n mở
n8n start