"""
Auto-push watcher for the PSA Search System.

What it does:
  Watches this folder (and every file/folder inside it). The moment you
  add, edit, or delete a file, it waits a couple of seconds (in case you're
  still saving), then automatically runs:
      git add -A
      git commit -m "Auto-update: <timestamp>"
      git push
  so your GitHub repo (and GitHub Pages site) always mirrors this folder.

Requirements (one-time setup, see SETUP.txt):
  1. Git installed on this computer.
  2. This folder already set up as a git repo pointed at your GitHub repo
     (git remote add origin ...), with a first commit already pushed.
  3. Git configured so it can push without asking for a password every time
     (Git Credential Manager on Windows handles this after your first
     manual push - it remembers your login).
  4. Python's "watchdog" package installed:
         pip install watchdog

Run it:
      python auto_push.py

Leave the window open. Every time you edit a file in this folder, it will
auto-commit and push within a few seconds. Press Ctrl+C to stop watching.
"""

import subprocess
import sys
import time
from pathlib import Path

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
except ImportError:
    print("Missing dependency. Run this first:\n    pip install watchdog")
    sys.exit(1)

WATCH_DIR = Path(__file__).resolve().parent
DEBOUNCE_SECONDS = 3          # wait this long after the last change before pushing
IGNORE_DIR_NAMES = {".git", "__pycache__", "node_modules"}


def run(cmd):
    result = subprocess.run(cmd, cwd=WATCH_DIR, capture_output=True, text=True)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def git_sync():
    # Stage everything (new, edited, deleted files)
    run(["git", "add", "-A"])

    # If nothing changed, skip
    code, out, _ = run(["git", "status", "--porcelain"])
    if not out:
        return

    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    code, out, err = run(["git", "commit", "-m", f"Auto-update: {timestamp}"])
    if code != 0:
        print("Commit skipped/failed:", err or out)
        return

    print(f"[{timestamp}] Committed changes. Pushing...")
    code, out, err = run(["git", "push"])
    if code == 0:
        print(f"[{timestamp}] Pushed to GitHub successfully.")
    else:
        print(f"[{timestamp}] Push failed:", err or out)
        print("If this mentions authentication, run 'git push' manually once")
        print("in this folder to log in, then restart this script.")


class ChangeHandler(FileSystemEventHandler):
    def __init__(self):
        self._pending = False
        self._last_event = 0

    def _touch(self, event):
        if any(part in IGNORE_DIR_NAMES for part in Path(event.src_path).parts):
            return
        self._last_event = time.time()
        self._pending = True

    def on_created(self, event):
        self._touch(event)

    def on_modified(self, event):
        self._touch(event)

    def on_deleted(self, event):
        self._touch(event)

    def on_moved(self, event):
        self._touch(event)

    def maybe_flush(self):
        if self._pending and (time.time() - self._last_event) >= DEBOUNCE_SECONDS:
            self._pending = False
            git_sync()


def main():
    if not (WATCH_DIR / ".git").exists():
        print("This folder is not a git repository yet.")
        print("See SETUP.txt for the one-time setup steps, then try again.")
        sys.exit(1)

    print(f"Watching: {WATCH_DIR}")
    print("Any file change will be auto-committed and pushed to GitHub.")
    print("Press Ctrl+C to stop.\n")

    handler = ChangeHandler()
    observer = Observer()
    observer.schedule(handler, str(WATCH_DIR), recursive=True)
    observer.start()

    try:
        while True:
            time.sleep(1)
            handler.maybe_flush()
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()
