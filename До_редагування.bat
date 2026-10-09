@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ============================================================
echo   Синхронізація data/ з GitHub
echo ============================================================
echo.

REM ─── 1. Відкотити локальні "фантомні" зміни в data/ ───
REM Вони вже на GitHub (їх туди відправив AutoSave).
echo [1/4] Відкочую локальні зміни в data/...
git restore data/
if errorlevel 1 (
    echo.
    echo ❌ Помилка при git restore data/. Перевірте повідомлення.
    echo.
    pause
    exit /b 1
)
echo.

REM ─── 2. Стягнути з GitHub ───
echo [2/4] Стягую зміни з GitHub...
git pull --no-edit
if errorlevel 1 (
    echo.
    echo ❌ Помилка при git pull. Перевірте повідомлення вище.
    echo.
    pause
    exit /b 1
)
echo.

REM ─── 3. Перевірити, чи є локальні зміни ───
echo [3/4] Перевіряю локальні зміни...
git status --short
echo.

REM ─── 4. Закомітити й запушити (якщо є зміни) ───
echo [4/4] Відправляю локальні зміни на GitHub...
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
pause >nul