"""
Helper script to fetch NCERT textbooks for physics, chemistry, biology, history.
"""
import os
import ssl
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

SUBJECT_CONFIGS = {
    "maths": {
        "prefix": "kemh1",
        "title": "Mathematics",
        "class": 11,
        "part": None,
        "chapters": list(range(1, 15)),
        "aux": ["ps", "a1", "an"]
    },
    "physics": {
        "prefix": "keph1",
        "title": "Physics",
        "class": 11,
        "part": "Part 1",
        "chapters": list(range(1, 8)),
        "aux": ["ps", "an"],
        "part2": {
            "prefix": "keph2",
            "chapters": list(range(1, 8)),
            "aux": ["ps", "an"]
        }
    },
    "chemistry": {
        "prefix": "kech1",
        "title": "Chemistry",
        "class": 11,
        "part": "Part 1",
        "chapters": list(range(1, 7)),
        "aux": ["ps", "an"]
    },
    "biology": {
        "prefix": "kebo1",
        "title": "Biology",
        "class": 11,
        "part": None,
        "chapters": list(range(1, 20)),
        "aux": ["ps", "an"]
    },
    "history": {
        "prefix": "kehs1",
        "title": "Themes in World History",
        "class": 11,
        "part": None,
        "chapters": list(range(1, 5)),
        "aux": ["ps"]
    }
}

def download_file(url: str, dest_path: Path, max_retries: int = 3):
    if dest_path.exists() and dest_path.stat().st_size > 1000:
        print(f"  [Exists] {dest_path.name} ({dest_path.stat().st_size} bytes)")
        return True

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    req = urllib.request.Request(url, headers=headers)
    for attempt in range(1, max_retries + 1):
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
                data = resp.read()
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                with open(dest_path, "wb") as f:
                    f.write(data)
                print(f"  [Downloaded] {dest_path.name} ({len(data)} bytes)")
                return True
        except urllib.error.HTTPError as e:
            if e.code == 404:
                print(f"  [Not Found] {filename if 'filename' in locals() else url}")
                return False
            if attempt == max_retries:
                print(f"  [Error] {url}: {e}")
                return False
            time.sleep(2)
        except Exception as e:
            if attempt == max_retries:
                print(f"  [Error] {url}: {e}")
                return False
            time.sleep(2)
    return False

def fetch_subject(subject: str):
    if subject not in SUBJECT_CONFIGS:
        print(f"Unknown subject: {subject}")
        return

    cfg = SUBJECT_CONFIGS[subject]
    out_dir = Path(f"data/{subject}")
    out_dir.mkdir(parents=True, exist_ok=True)

    # Save meta.json
    import json
    meta_path = out_dir / "meta.json"
    if not meta_path.exists():
        meta = {
            "title": cfg["title"],
            "class": cfg["class"],
            "part": cfg["part"]
        }
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)
        print(f"Created {meta_path}")

    prefix = cfg["prefix"]
    print(f"Fetching {subject} chapters...")
    for ch in cfg["chapters"]:
        filename = f"{prefix}{ch:02d}.pdf"
        url = f"https://ncert.nic.in/textbook/pdf/{filename}"
        download_file(url, out_dir / filename)

    for aux in cfg.get("aux", []):
        filename = f"{prefix}{aux}.pdf"
        url = f"https://ncert.nic.in/textbook/pdf/{filename}"
        download_file(url, out_dir / filename)

    if "part2" in cfg:
        p2 = cfg["part2"]
        p2_prefix = p2["prefix"]
        print(f"Fetching {subject} Part 2 chapters...")
        for ch in p2["chapters"]:
            filename = f"{p2_prefix}{ch:02d}.pdf"
            url = f"https://ncert.nic.in/textbook/pdf/{filename}"
            download_file(url, out_dir / filename)
        for aux in p2.get("aux", []):
            filename = f"{p2_prefix}{aux}.pdf"
            url = f"https://ncert.nic.in/textbook/pdf/{filename}"
            download_file(url, out_dir / filename)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        fetch_subject(sys.argv[1])
    else:
        for s in ["physics", "chemistry", "biology", "history"]:
            fetch_subject(s)
