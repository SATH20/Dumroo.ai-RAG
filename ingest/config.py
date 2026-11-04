"""Configuration and client initializers for the NCERT ingestion pipeline."""

import os
import shutil
import logging
from pathlib import Path
from dotenv import load_dotenv

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
INGEST_DIR = BASE_DIR / "ingest"
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = INGEST_DIR / "cache"
LOGS_DIR = INGEST_DIR / "logs"

# Ensure directories exist
CACHE_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Load secrets from ingest/.env first, then root .env if present
env_file = INGEST_DIR / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)
else:
    root_env = BASE_DIR / ".env"
    if root_env.exists():
        load_dotenv(dotenv_path=root_env)

# Environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_BACKUP_API_KEY = os.getenv("GEMINI_BACKUP_API_KEY", "").strip()

_active_key_index = 0

def get_gemini_api_keys():
    keys = [GEMINI_API_KEY]
    if GEMINI_BACKUP_API_KEY:
        keys.append(GEMINI_BACKUP_API_KEY)
    return [k for k in keys if k]

def rotate_gemini_key() -> bool:
    global _active_key_index
    keys = get_gemini_api_keys()
    if len(keys) > 1:
        _active_key_index = (_active_key_index + 1) % len(keys)
        return True
    return False

# Embedding configuration
EMBED_MODEL = os.getenv("EMBED_MODEL", os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2"))
EMBED_DIM = int(os.getenv("EMBED_DIM", "768"))
EMBEDDING_MODEL = EMBED_MODEL
EMBEDDING_DIM = EMBED_DIM

# Storage bucket
STORAGE_BUCKET = "textbook-images"

# Configure tesseract path for Windows fallback if not on PATH
import pytesseract

if not shutil.which("tesseract"):
    default_win_tesseract = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    if default_win_tesseract.exists():
        pytesseract.pytesseract.tesseract_cmd = str(default_win_tesseract)


def get_tesseract_version() -> str | None:
    """Check if Tesseract binary is functional."""
    try:
        return pytesseract.get_tesseract_version()
    except Exception:
        return None


def get_supabase_client():
    """Lazily create and return Supabase client."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in ingest/.env"
        )
    from supabase import create_client, ClientOptions

    # Configure client
    return create_client(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        options=ClientOptions(postgrest_client_timeout=60, storage_client_timeout=60),
    )


def get_gemini_client():
    """Lazily create and return Google GenAI client for the active key."""
    keys = get_gemini_api_keys()
    if not keys:
        raise ValueError("GEMINI_API_KEY must be set in ingest/.env")
    current_key = keys[_active_key_index % len(keys)]
    from google import genai

    return genai.Client(api_key=current_key)
