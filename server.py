"""Local UTLT water bridge: ESP32 pulse packets -> SQLite -> browser dashboard."""

from __future__ import annotations

import argparse
import hmac
import json
import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("UTLT_DB_PATH", ROOT / "water.sqlite3"))
DEVICE_TOKEN = os.environ.get("UTLT_DEVICE_TOKEN", "")
PULSES_PER_LITRE = float(os.environ.get("UTLT_PULSES_PER_LITRE", "450"))
DEVICE_TIMEOUT_SECONDS = 30
DB_LOCK = Lock()
FILES = {"/": "index.html", "/index.html": "index.html", "/styles.css": "styles.css",
         "/data.js": "data.js", "/app.js": "app.js"}
SESSION_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def connect_db():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    return connection


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS packets (
              session TEXT NOT NULL, sequence INTEGER NOT NULL,
              pulses INTEGER NOT NULL, litres REAL NOT NULL,
              recorded_at TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Misc',
              PRIMARY KEY (session, sequence)
            );
            CREATE TABLE IF NOT EXISTS device (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              last_seen_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS packets_recorded_at ON packets(recorded_at);
        """)


def snapshot():
    cutoff = (datetime.now(ZoneInfo("Asia/Kolkata")).date() - timedelta(days=5)).isoformat()
    with connect_db() as db:
        rows = db.execute(
            "SELECT substr(recorded_at, 1, 16) AS minute, substr(recorded_at, -6) AS offset, "
            "SUM(litres) AS litres, category FROM packets "
            "WHERE pulses > 0 AND recorded_at >= ? "
            "GROUP BY minute, offset, category ORDER BY minute", (cutoff,)
        ).fetchall()
        last = db.execute("SELECT last_seen_at FROM device WHERE id = 1").fetchone()
    last_seen = last["last_seen_at"] if last else None
    connected = bool(last_seen and
                     (datetime.now(timezone.utc) - datetime.fromisoformat(last_seen)).total_seconds()
                     <= DEVICE_TIMEOUT_SECONDS)
    return {
        "readings": [{"recordedAt": row["minute"] + ":00" + row["offset"],
                      "litres": round(row["litres"], 6), "category": row["category"]}
                     for row in rows],
        "device": {"connected": connected, "lastConnectedAt": last_seen},
        "pulsesPerLitre": PULSES_PER_LITRE,
    }


def record_packet(payload):
    if not isinstance(payload, dict):
        raise ValueError("Expected a JSON object")
    session, sequence, pulses = (payload.get(key) for key in ("session", "sequence", "pulses"))
    if not isinstance(session, str) or not SESSION_RE.fullmatch(session):
        raise ValueError("Invalid session")
    if type(sequence) is not int or sequence < 0 or sequence > 2_147_483_647:
        raise ValueError("Invalid sequence")
    if type(pulses) is not int or pulses < 0 or pulses > 100_000:
        raise ValueError("Invalid pulse count")
    now = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds")
    litres = round(pulses / PULSES_PER_LITRE, 6)
    with DB_LOCK, connect_db() as db:
        existing = db.execute(
            "SELECT pulses FROM packets WHERE session = ? AND sequence = ?", (session, sequence)
        ).fetchone()
        if existing and existing["pulses"] != pulses:
            raise ValueError("Sequence reused with a different pulse count")
        if not existing:
            db.execute(
                "INSERT INTO packets (session, sequence, pulses, litres, recorded_at) "
                "VALUES (?, ?, ?, ?, ?)", (session, sequence, pulses, litres, now)
            )
        db.execute("INSERT INTO device (id, last_seen_at) VALUES (1, ?) "
                   "ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at", (now,))
    return {"ok": True, "duplicate": bool(existing), "litres": litres}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/water":
            self.send_json(200, snapshot())
            return
        name = FILES.get(path)
        if not name:
            self.send_error(404)
            return
        data = (ROOT / name).read_bytes()
        mime = "text/html" if name.endswith(".html") else "text/css" if name.endswith(".css") else "text/javascript"
        self.send_response(200)
        self.send_header("Content-Type", mime + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/api/device/reading":
            self.send_error(404)
            return
        if not DEVICE_TOKEN or not hmac.compare_digest(
            self.headers.get("X-UTLT-Device-Token", ""), DEVICE_TOKEN
        ):
            self.send_json(401, {"error": "Device token required"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 1024:
                raise ValueError("Body must be 1–1024 bytes")
            payload = json.loads(self.rfile.read(length))
            self.send_json(200, record_packet(payload))
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_json(400, {"error": str(exc)})


def main():
    parser = argparse.ArgumentParser(description="UTLT local water bridge")
    parser.add_argument("--host", default="127.0.0.1",
                        help="Use 0.0.0.0 for phones and ESP32 on the same trusted Wi-Fi")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--ble", action="store_true",
                        help="Also receive ESP32 Bluetooth readings (requires bleak)")
    args = parser.parse_args()
    if not DEVICE_TOKEN:
        parser.error("Set UTLT_DEVICE_TOKEN to a long random value before starting")
    if not 0 < PULSES_PER_LITRE < 100_000:
        parser.error("UTLT_PULSES_PER_LITRE must be positive")
    init_db()
    if args.ble:
        try:
            import bleak  # noqa: F401 - check optional dependency before starting the server
        except ImportError:
            parser.error("Bluetooth requires bleak: python3 -m pip install bleak")
        import ble_bridge
        ble_bridge.start(record_packet)
        print("BLE receiver enabled; scanning for UTLT-Water")
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"UTLT dashboard: http://{args.host}:{args.port}/")
    print(f"Pulse calibration: {PULSES_PER_LITRE:g} pulses/L")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
