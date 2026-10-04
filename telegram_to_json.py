#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
telegram_to_json.py
===================

Масовий імпорт YouTube-посилань з експорту Telegram у каталог.

Що робить:
  1. Знаходить найновішу підтеку ChatExport_* у теці Telegram Desktop.
  2. Читає result.json, витягує всі YouTube-посилання.
  3. Дедуплікує в межах експорту.
  4. Підтягує назви відео через noembed.com.
  5. Очищає назви від емодзі та прихованих Unicode-символів.
  6. Питає у користувача альбом, розділ, підрозділ.
  7. Читає відповідний <album>.json із репозиторію.
  8. Дедуплікує за (url, section, subsection).
  9. Дописує нові відео й перезаписує файл.
 10. Питає, чи пушити на GitHub. Якщо так — git add / commit / push.

Запуск:
  python telegram_to_json.py

Залежності: тільки стандартна бібліотека Python 3.
"""

import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

# ═══════════════════════════════════════════════════════════════
#  НАЛАШТУВАННЯ
# ═══════════════════════════════════════════════════════════════

REPO_DIR = Path(r"C:\Users\Kodak\PycharmProjects\video-catalog")
DATA_DIR = REPO_DIR / "data"
TELEGRAM_DESKTOP_DIR = Path(r"C:\Users\Kodak\Downloads\Telegram Desktop")

NOEMBED_TIMEOUT = 10
NOEMBED_DELAY = 0.3
NOEMBED_RETRIES = 2

UNDISTRIBUTED = "00 Нерозподілені"

# ═══════════════════════════════════════════════════════════════
#  ОЧИЩЕННЯ НАЗВ
# ═══════════════════════════════════════════════════════════════


def clean_title(text: str) -> str:
    """
    Очищає назву відео від емодзі та прихованих Unicode-символів.

    Залишає:
      - усі звичайні літери (кирилиця, латиниця, ієрогліфи...),
      - цифри, розділові знаки, хештеги, дужки, лапки.

    Прибирає:
      - емодзі (усі блоки Unicode),
      - нульової ширини пробіли й маркери,
      - BOM, роздільники рядків, нерозривні пробіли,
      - варіаційні селектори (керують виглядом емодзі).
    """
    if not text:
        return ""

    # 1. Прибираємо конкретні невидимі/керуючі символи
    hidden_chars = (
        '\u200B',  # zero width space
        '\u200C',  # zero width non-joiner
        '\u200D',  # zero width joiner
        '\u2060',  # word joiner
        '\u180E',  # mongolian vowel separator
        '\uFEFF',  # BOM
        '\u2028',  # line separator
        '\u2029',  # paragraph separator
        '\u00A0',  # non-breaking space
    )
    for ch in hidden_chars:
        text = text.replace(ch, '')

    # 2. Прибираємо емодзі та варіаційні селектори
    result = []
    for ch in text:
        cp = ord(ch)

        # Варіаційні селектори
        if 0xFE00 <= cp <= 0xFE0F:
            continue

        # Емодзі-блоки Unicode
        if 0x1F000 <= cp <= 0x1FAFF:   # mahjong, dominoes, cards, емодзі
            continue
        if 0x2600 <= cp <= 0x27BF:     # misc symbols, dingbats
            continue
        if 0x2B00 <= cp <= 0x2BFF:     # arrows, geometric shapes
            continue
        if 0x1F1E6 <= cp <= 0x1F1FF:   # regional indicators (прапори)
            continue
        if cp == 0x20E3:               # combining enclosing keycap
            continue
        if cp == 0x2122 or cp == 0x2120:  # ™ ℠
            continue

        # Інші службові символи (Control chars)
        if cp < 0x20 and ch not in ('\n', '\t'):
            continue
        if cp == 0x7F:                 # DEL
            continue

        result.append(ch)

    text = ''.join(result)

    # 3. Стискаємо пробіли й обрізаємо
    text = re.sub(r'\s+', ' ', text).strip()

    return text


# ═══════════════════════════════════════════════════════════════
#  УТИЛІТИ
# ═══════════════════════════════════════════════════════════════


def extract_youtube_id(url: str) -> str:
    """Витягує 11-символьний ID з URL YouTube будь-якого формату."""
    if not url or not isinstance(url, str):
        return ""
    u = url.strip()
    patterns = [
        r'youtu\.be/([A-Za-z0-9_-]{11})',
        r'/shorts/([A-Za-z0-9_-]{11})',
        r'/embed/([A-Za-z0-9_-]{11})',
        r'/live/([A-Za-z0-9_-]{11})',
        r'[?&]v=([A-Za-z0-9_-]{11})',
    ]
    for pat in patterns:
        m = re.search(pat, u)
        if m:
            return m.group(1)
    return ""


def normalize_youtube_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def get_youtube_title(video_id: str, cache: dict) -> str:
    """Назва відео через noembed.com. Кеш у пам'яті."""
    if video_id in cache:
        return cache[video_id]

    url = normalize_youtube_url(video_id)
    api = "https://noembed.com/embed?" + urllib.parse.urlencode({"url": url})

    title = ""
    for attempt in range(NOEMBED_RETRIES + 1):
        try:
            req = urllib.request.Request(
                api,
                headers={"User-Agent": "telegram_to_json/1.0"},
            )
            with urllib.request.urlopen(req, timeout=NOEMBED_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            title = (data.get("title") or "").strip()
            break
        except Exception as e:
            if attempt < NOEMBED_RETRIES:
                time.sleep(1.0)
                continue
            print(f"      ! noembed не відповів для {video_id}: {e}")

    # Очищаємо від емодзі та прихованих символів
    title = clean_title(title)

    cache[video_id] = title
    return title


def extract_links_from_message(msg: dict) -> list:
    """Витягує всі URL з одного повідомлення Telegram."""
    urls = []

    def collect(text_field):
        if isinstance(text_field, str):
            urls.extend(re.findall(r'https?://[^\s]+', text_field))
        elif isinstance(text_field, list):
            for part in text_field:
                if isinstance(part, str):
                    urls.extend(re.findall(r'https?://[^\s]+', part))
                elif isinstance(part, dict):
                    t = part.get("text", "")
                    if t:
                        urls.extend(re.findall(r'https?://[^\s]+', t))

    collect(msg.get("text"))
    collect(msg.get("text_entities"))
    return urls


# ═══════════════════════════════════════════════════════════════
#  ПОШУК ФАЙЛІВ
# ═══════════════════════════════════════════════════════════════


def find_latest_result_json() -> Path:
    """Знаходить найновішу підтеку ChatExport_* з result.json."""
    if not TELEGRAM_DESKTOP_DIR.exists():
        print(f"! Не знайдено теку: {TELEGRAM_DESKTOP_DIR}")
        sys.exit(1)

    candidates = []
    for p in TELEGRAM_DESKTOP_DIR.iterdir():
        if not p.is_dir():
            continue
        if not p.name.startswith("ChatExport_"):
            continue
        result = p / "result.json"
        if result.is_file():
            candidates.append(result)

    if not candidates:
        print(f"! У теці {TELEGRAM_DESKTOP_DIR}")
        print("  не знайдено жодної підтеки ChatExport_* з result.json.")
        print("  Експортуйте чат із Telegram Desktop і спробуйте знову.")
        sys.exit(1)

    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def load_albums() -> list:
    """Читає albums.json із репозиторію."""
    path = DATA_DIR / "albums.json"
    if not path.exists():
        print(f"! Не знайдено {path}")
        sys.exit(1)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("albums.json має містити масив")
        return data
    except Exception as e:
        print(f"! Помилка читання albums.json: {e}")
        sys.exit(1)


# ═══════════════════════════════════════════════════════════════
#  ІНТЕРАКТИВ
# ═══════════════════════════════════════════════════════════════


def choose_album(albums: list) -> dict:
    print()
    print("Доступні альбоми:")
    for i, a in enumerate(albums, start=1):
        title = a.get("title", a.get("id", "?"))
        print(f"  {i:>2}. {a.get('id', '?')} ({title})")

    while True:
        raw = input(f"Виберіть номер альбому (1-{len(albums)}): ").strip()
        if not raw.isdigit():
            print("  ! Введіть число.")
            continue
        n = int(raw)
        if 1 <= n <= len(albums):
            return albums[n - 1]
        print(f"  ! Число має бути від 1 до {len(albums)}.")


def load_album_videos(album: dict) -> tuple:
    filename = album.get("file") or f"{album['id']}.json"
    path = DATA_DIR / filename
    if not path.exists():
        return path, []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            data = []
        return path, data
    except Exception as e:
        print(f"! Помилка читання {path.name}: {e}")
        sys.exit(1)


def choose_section(videos: list) -> str:
    counts = {}
    for v in videos:
        s = v.get("section") or UNDISTRIBUTED
        counts[s] = counts.get(s, 0) + 1

    sections = sorted(counts.keys(), key=lambda x: x.lower())

    print()
    print("Розділи в цьому альбомі:")
    for i, s in enumerate(sections, start=1):
        print(f"  {i:>2}. {s} ({counts[s]} відео)")
    print(f"   N. Створити новий розділ")

    while True:
        raw = input(f"Виберіть номер, N або Enter (щоб взяти «{UNDISTRIBUTED}»): ").strip()

        if raw == "":
            return UNDISTRIBUTED

        if raw.lower() == "n":
            name = input("Назва нового розділу: ").strip()
            if name:
                return name
            print("  ! Назва не може бути порожньою.")
            continue

        if raw.isdigit():
            n = int(raw)
            if 1 <= n <= len(sections):
                return sections[n - 1]

        print("  ! Введіть номер, N або Enter.")


def choose_subsection() -> str:
    print()
    raw = input("Підрозділ (Enter — без підрозділу): ").strip()
    return raw


def confirm(prompt: str) -> bool:
    raw = input(prompt + " (y/n): ").strip().lower()
    return raw in ("y", "yes", "т", "так")


# ═══════════════════════════════════════════════════════════════
#  GIT
# ═══════════════════════════════════════════════════════════════


def run_git(args: list, cwd: Path) -> bool:
    try:
        res = subprocess.run(
            ["git"] + args,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if res.returncode != 0:
            print(f"  ! git {' '.join(args)}: {res.stderr.strip()}")
            return False
        return True
    except FileNotFoundError:
        print("  ! git не знайдено в PATH. Запустіть через Git Bash або додайте git у PATH.")
        return False
    except Exception as e:
        print(f"  ! git помилка: {e}")
        return False


def git_push(album_file: str, section: str) -> bool:
    rel = f"data/{album_file}"

    if not run_git(["add", rel], REPO_DIR):
        return False

    res = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=str(REPO_DIR),
    )
    if res.returncode == 0:
        print("  i Немає змін для коміту (файл не змінився).")
        return True

    msg = f"Import Telegram: {section}"
    if not run_git(["commit", "-m", msg], REPO_DIR):
        return False

    if not run_git(["push"], REPO_DIR):
        return False

    return True


# ═══════════════════════════════════════════════════════════════
#  ГОЛОВНА ЛОГІКА
# ═══════════════════════════════════════════════════════════════


def main():
    print("=" * 60)
    print("  Telegram -> JSON конвертер")
    print("=" * 60)
    print()

    if not REPO_DIR.exists():
        print(f"! Не знайдено репозиторій: {REPO_DIR}")
        sys.exit(1)

    result_path = find_latest_result_json()
    print(f"Експорт:  {result_path}")
    print(f"Репозиторій: {REPO_DIR}")
    print()

    try:
        raw = result_path.read_text(encoding="utf-8", errors="replace")
        data = json.loads(raw)
    except Exception as e:
        print(f"! Не вдалось прочитати result.json: {e}")
        sys.exit(1)

    messages = data.get("messages", [])
    if not isinstance(messages, list):
        print("! У result.json немає масиву 'messages'.")
        sys.exit(1)

    print(f"Повідомлень у експорті: {len(messages)}")

    seen_ids = set()
    ordered_ids = []
    total_links = 0

    for msg in messages:
        for url in extract_links_from_message(msg):
            vid = extract_youtube_id(url)
            if not vid:
                continue
            total_links += 1
            if vid in seen_ids:
                continue
            seen_ids.add(vid)
            ordered_ids.append(vid)

    if not ordered_ids:
        print("! У жодному повідомленні не знайдено YouTube-посилань.")
        print("  Нічого не змінено.")
        sys.exit(0)

    duplicates_in_export = total_links - len(ordered_ids)
    print(f"YouTube-посилань знайдено: {total_links}")
    if duplicates_in_export > 0:
        print(f"  - дублікатів у межах експорту: {duplicates_in_export} (пропущено)")
    print(f"  - унікальних ID: {len(ordered_ids)}")
    print()

    albums = load_albums()
    album = choose_album(albums)

    album_path, videos = load_album_videos(album)
    print(f"Файл альбому: {album_path.name}")
    print(f"У ньому зараз: {len(videos)} відео")

    section = choose_section(videos)
    subsection = choose_subsection()

    print()
    print("=" * 60)
    print(f"  Альбом:      {album.get('title', album['id'])}")
    print(f"  Файл:        {album_path.name}")
    print(f"  Розділ:      {section}")
    print(f"  Підрозділ:   {subsection or '(без підрозділу)'}")
    print("=" * 60)
    print()

    if not confirm("Продовжити імпорт?"):
        print("Скасовано.")
        sys.exit(0)

    existing_keys = set()
    for v in videos:
        url = v.get("url", "")
        sec = v.get("section", "")
        sub = v.get("subsection", "")
        existing_keys.add((url, sec, sub))

    print()
    print(f"Отримую назви з YouTube ({len(ordered_ids)} шт.)...")

    title_cache = {}
    new_records = []
    skipped_existing = 0

    for i, vid in enumerate(ordered_ids, start=1):
        url = normalize_youtube_url(vid)
        key = (url, section, subsection)

        if key in existing_keys:
            skipped_existing += 1
            continue

        title = get_youtube_title(vid, title_cache)
        if not title:
            title = f"Відео {vid}"

        record = {
            "title": title,
            "section": section,
            "url": url,
        }
        if subsection:
            record["subsection"] = subsection

        new_records.append(record)
        print(f"  [{i:>3}/{len(ordered_ids)}] {title[:70]}")

        if vid not in title_cache or title_cache.get(vid):
            time.sleep(NOEMBED_DELAY)

    print()
    if not new_records:
        print("Немає нових відео для додавання.")
        if skipped_existing:
            print(f"  Пропущено як наявні: {skipped_existing}")
        print("Файл не змінено.")
        sys.exit(0)

    before_count = len(videos)
    videos.extend(new_records)
    after_count = len(videos)

    album_path.write_text(
        json.dumps(videos, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("=" * 60)
    print("Готово!")
    print("=" * 60)
    print(f"  Додано нових:              {len(new_records)}")
    if skipped_existing:
        print(f"  Пропущено як наявні:       {skipped_existing}")
    if duplicates_in_export:
        print(f"  Дублікатів у експорті:     {duplicates_in_export}")
    print(f"  Було відео в альбомі:      {before_count}")
    print(f"  Стало відео в альбомі:     {after_count}")
    print(f"  Файл оновлено: {album_path}")
    print()

    if confirm("Запушити на GitHub?"):
        print()
        print("Пуш на GitHub...")
        if git_push(album_path.name, section):
            print("  + Закомічено й запушено.")
        else:
            print("  ! Пуш не вдався. Перевірте git у консолі.")
    else:
        print()
        print("Файл оновлено локально. Закомітьте його вручну в PyCharm.")

    print()
    print("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
        print("Перервано користувачем.")
        sys.exit(1)