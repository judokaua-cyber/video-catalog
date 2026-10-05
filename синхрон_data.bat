@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ============================================================
echo   Синхронізація data/ з GitHub
echo ============================================================
echo.

REM ─── 1. Стягнути з GitHub ───
echo [1/3] Стягую зміни з GitHub...
git pull --no-edit
if errorlevel 1 (
    echo.
    echo ❌ Помилка при git pull. Перевірте повідомлення вище.
    echo.
    pause
    exit /b 1
)
echo.

REM ─── 2. Перевірити, чи є локальні зміни ───
echo [2/3] Перевіряю локальні зміни...
git status --short
echo.

REM ─── 3. Закомітити й запушити (якщо є зміни) ───
echo [3/3] Відправляю локальні зміни на GitHub...
git add data/
git commit -m "Sync data from PC: %DATE% %TIME%" --allow-empty
if errorlevel 1 (
    echo.
    echo ℹ Немає нових змін для коміту.
) else (
    echo.
    echo ↑ Відправляю на GitHub...
    git push
    if errorlevel 1 (
        echo.
        echo ❌ Помилка при git push. Перевірте повідомлення вище.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo ============================================================
echo   ✅ Готово!
echo ============================================================
echo.
echo   Тепер у PyCharm виконайте: git pull
echo   (щоб підтягнути свіжі дані)
echo.
pause >nul