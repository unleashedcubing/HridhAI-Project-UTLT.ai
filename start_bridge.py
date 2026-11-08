"""Start the local dashboard and BLE receiver using the ESP32's device token."""

import os
import runpy
import sys
from pathlib import Path

settings = Path(__file__).parent / "esp32" / "config.py"
if not settings.exists():
    raise SystemExit("Create esp32/config.py from esp32/config.example.py first")
config = runpy.run_path(str(settings))
token = config.get("DEVICE_TOKEN", "")
if not token or token == "SAME_LONG_RANDOM_TOKEN_AS_SERVER":
    raise SystemExit("Set DEVICE_TOKEN in esp32/config.py first")
os.environ["UTLT_DEVICE_TOKEN"] = token
sys.argv = ["server.py", "--host", "0.0.0.0", "--port", str(config.get("SERVER_PORT", 8080)), "--ble"]

import server

server.main()
