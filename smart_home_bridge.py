"""Read-only Home Assistant adapter for UTLT.ai.

This does not scrape Alexa or Google Home. It reads only explicitly configured
Home Assistant sensor entities through Home Assistant's authenticated REST API.
"""
from __future__ import annotations

import json
import math
import os
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

_NUMERIC = re.compile(r"^-?\\d+(?:\\.\\d+)?$")
_ALLOWED_STATE_CLASSES = {"measurement", "total", "total_increasing"}
_WATER_UNITS = {"l", "liter", "liters", "litre", "litres", "ml", "m³", "m3", "gal", "gallon", "gallons"}
_ENERGY_UNITS = {"wh", "kwh", "mwh"}
_POWER_UNITS = {"w", "kw", "mw"}


def _configuration():
    base = os.environ.get("UTLT_HOME_ASSISTANT_URL", "").strip().rstrip("/")
    token = os.environ.get("UTLT_HOME_ASSISTANT_TOKEN", "").strip()
    if not base or not token:
        return None, None
    parsed = urlparse(base)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("Home Assistant URL must be an http(s) URL without embedded credentials")
    if parsed.query or parsed.fragment:
        raise ValueError("Home Assistant URL must not contain a query or fragment")
    return base, token


def _classify(attrs):
    device_class = str(attrs.get("device_class") or "").lower()
    unit = str(attrs.get("unit_of_measurement") or "").strip().lower()
    state_class = str(attrs.get("state_class") or "").lower()
    if device_class in {"water"} or unit in _WATER_UNITS:
        return "water"
    if device_class in {"gas"}:
        return "gas"
    if device_class in {"energy"} or unit in _ENERGY_UNITS:
        return "electricity"
    if device_class in {"power"} or unit in _POWER_UNITS:
        return "electricity"
    return None


def get_snapshot():
    """Return a privacy-filtered snapshot of supported numeric sensor entities."""
    try:
        base, token = _configuration()
    except ValueError as exc:
        return {"status": "configuration_error", "source": "home_assistant", "message": str(exc), "devices": []}
    if not base:
        return {
            "status": "not_configured", "source": "home_assistant",
            "message": "Home Assistant is not configured on this local bridge.",
            "devices": [],
        }
    request = Request(
        base + "/api/states",
        headers={"Authorization": "Bearer " + token, "Accept": "application/json"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=6) as response:
            payload = json.loads(response.read(2_000_000).decode("utf-8"))
    except HTTPError as exc:
        return {"status": "error", "source": "home_assistant",
                "message": "Home Assistant rejected the bridge credentials (HTTP %d)." % exc.code, "devices": []}
    except (URLError, TimeoutError, OSError, UnicodeDecodeError, json.JSONDecodeError):
        return {"status": "error", "source": "home_assistant",
                "message": "Could not reach Home Assistant. Check the local URL and network.", "devices": []}
    if not isinstance(payload, list):
        return {"status": "error", "source": "home_assistant",
                "message": "Home Assistant returned an unexpected response.", "devices": []}

    devices = []
    for item in payload:
        if not isinstance(item, dict) or not str(item.get("entity_id", "")).startswith("sensor."):
            continue
        attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
        state = str(item.get("state", "")).strip()
        if not _NUMERIC.fullmatch(state):
            continue
        value = float(state)
        if not math.isfinite(value):
            continue
        utility = _classify(attrs)
        if not utility:
            continue
        state_class = str(attrs.get("state_class") or "").lower()
        if state_class not in _ALLOWED_STATE_CLASSES:
            continue
        unit = str(attrs.get("unit_of_measurement") or "")
        devices.append({
            "entityId": str(item.get("entity_id", ""))[:160],
            "name": str(attrs.get("friendly_name") or item.get("entity_id") or "Unnamed sensor")[:100],
            "utility": utility,
            "value": value,
            "unit": unit[:24],
            "deviceClass": str(attrs.get("device_class") or "")[:32],
            "stateClass": state_class,
            "kind": "cumulative" if state_class in {"total", "total_increasing"} else "instantaneous",
            "updatedAt": str(item.get("last_updated") or "")[:40],
        })
    devices.sort(key=lambda row: (row["utility"], row["name"].casefold()))
    return {
        "status": "connected",
        "source": "home_assistant",
        "message": "Read-only sensor snapshot received from Home Assistant.",
        "devices": devices[:100],
    }
