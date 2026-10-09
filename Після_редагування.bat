@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ============================================================
echo   Коміт і пуш правок у data/ (з ПК)
echo ============================================================
echo.

REM ─── 1. Перевірити, чи є зміни ───
echo [1/4] Перевіряю зміни в data/...
git status --short data/
echo.

REM ─── 2. Додати всі зміни в data/ ───
echo [2/4] Додаю зміни...
git add data/

REM Перевірка, чи є що комітити
git diff --cached --quiet
if errorlevel 1 goto has_changes

echo.
echo ℹ Немає змін у data/. Нічого комітити.
echo.
pause >nul
exit /b 0

:has_changes

REM ─── 3. Коміт ───
echo.
echo [3/4] Комічу...
git commit -m "Update data from PC: %DATE% %TIME%"
if errorlevel 1 (
    echo.
    echo ❌ Помилка при git commit. Перевірте повідомлення вище.
    echo.
    pause
    exit /b 1
)

REM ─── 4. Пуш ───
echo.
echo [4/4] Відправляю на GitHub...
git push
if errorlevel 1 (
    echo.
    echo ⚠ Push відхилено. Спробую стягнути з GitHub і повторити...
    echo.
    git pull --no-edit
    if errorlevel 1 (
        echo.
        echo ❌ Помилка при git pull. Ймовірно, є конфлікт.
        echo    Відкрийте PyCharm і вирішіть конфлікт вручну.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo ↑ Повторюю push...
    git push
    if errorlevel 1 (
        echo.
        echo ❌ Push знову відхилено. Перевірте повідомлення вище.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo ============================================================
echo   ✅ Готово! Зміни на GitHub.
echo ============================================================
echo.
pause >nul