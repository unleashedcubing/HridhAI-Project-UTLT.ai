"""Standalone UTLT.ai: ESP32 access point, flow sensor and phone web app.

Power the board from USB or a power bank. Connect the phone to AP_SSID from
config.py, then open http://192.168.4.1/ in its browser. No Mac is needed.
The pump is powered separately and is not connected to an ESP32 output.
"""

import gc
import json
import machine
import network
import os
import socket
import struct
import time

import config

FLOW_PIN = 27
PULSES_PER_LITRE = 450.0  # Calibrate with a measured volume later.
FILES = {
    "/": ("index.html", "text/html"),
    "/index.html": ("index.html", "text/html"),
    "/app.js": ("app.js", "text/javascript"),
    "/data.js": ("data.js", "text/javascript"),
    "/styles.css": ("styles.css", "text/css"),
}

_pulses = 0
_last_ble_pulses = 0
_session_bytes = machine.unique_id()[:4] + os.urandom(4)
SESSION = _session_bytes.hex()


def on_pulse(pin):
    global _pulses
    _pulses += 1


flow = machine.Pin(FLOW_PIN, machine.Pin.IN, machine.Pin.PULL_UP)
flow.irq(trigger=machine.Pin.IRQ_FALLING, handler=on_pulse)


def pulse_count():
    state = machine.disable_irq()
    count = _pulses
    machine.enable_irq(state)
    return count


def start_access_point():
    password = config.AP_PASSWORD
    if len(password) < 8:
        raise ValueError("AP_PASSWORD must have at least 8 characters")
    ap = network.WLAN(network.AP_IF)
    ap.active(True)
    ap.config(essid=config.AP_SSID, password=password,
              authmode=network.AUTH_WPA_WPA2_PSK)
    print("Join Wi-Fi:", config.AP_SSID)
    print("Open on phone: http://%s/" % ap.ifconfig()[0])
    return ap


class OptionalBLE:
    """Keep BLE notifications available for testing; the phone app uses Wi-Fi."""

    def __init__(self):
        self.radio = None
        self.connection = None
        try:
            import bluetooth
            self.radio = bluetooth.BLE()
            self.radio.active(True)
            self.radio.irq(self.on_event)
            service = bluetooth.UUID("930a7d60-8489-4b31-9cc6-64ee5e809100")
            reading = bluetooth.UUID("930a7d60-8489-4b31-9cc6-64ee5e809101")
            ((self.handle,),) = self.radio.gatts_register_services((
                (service, ((reading, bluetooth.FLAG_READ | bluetooth.FLAG_NOTIFY),)),
            ))
            self.advertise()
            print("BLE advertising as UTLT-Water")
        except (ImportError, OSError) as exc:
            print("BLE unavailable; phone Wi-Fi app still works:", exc)
            self.radio = None

    def advertise(self):
        name = b"UTLT-Water"
        payload = b"\x02\x01\x06" + bytes((len(name) + 1, 9)) + name
        self.radio.gap_advertise(100000, adv_data=payload)

    def on_event(self, event, data):
        if event == 1:
            self.connection = data[0]
        elif event == 2:
            self.connection = None
            self.advertise()

    def publish(self, sequence, pulses):
        if self.radio is None:
            return
        packet = _session_bytes + struct.pack("<II", sequence, pulses)
        self.radio.gatts_write(self.handle, packet)
        if self.connection is not None:
            try:
                self.radio.gatts_notify(self.connection, self.handle, packet)
            except OSError:
                pass


def write_response(client, status, mime, length):
    header = ("HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %d\r\n"
              "Cache-Control: no-store\r\nConnection: close\r\n\r\n") % (status, mime, length)
    client.write(header.encode())


def handle_client(client):
    client.settimeout(3)
    request = client.recv(1024)
    first_line = request.split(b"\r\n", 1)[0].split()
    if len(first_line) < 2 or first_line[0] != b"GET":
        write_response(client, "405 Method Not Allowed", "text/plain", 0)
        return
    path = first_line[1].decode().split("?", 1)[0]
    if path == "/api/water":
        body = json.dumps({
            "mode": "standalone", "session": SESSION,
            "totalPulses": pulse_count(), "pulsesPerLitre": PULSES_PER_LITRE,
            "device": {"connected": True, "lastConnectedAt": None},
            "readings": [],
        }).encode()
        write_response(client, "200 OK", "application/json", len(body))
        client.write(body)
        return
    item = FILES.get(path)
    if item is None:
        write_response(client, "404 Not Found", "text/plain", 0)
        return
    filename, mime = item
    try:
        size = os.stat(filename)[6]
        write_response(client, "200 OK", mime, size)
        with open(filename, "rb") as source:
            while True:
                chunk = source.read(1024)
                if not chunk:
                    break
                client.write(chunk)
    except OSError as exc:
        print("File request failed:", filename, exc)


def serve():
    start_access_point()
    ble = OptionalBLE()
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("0.0.0.0", 80))
    listener.listen(3)
    listener.settimeout(0.3)
    print("UTLT standalone dashboard ready; flow sensor on GPIO27")
    sequence = 0
    last_notify = time.ticks_ms()
    global _last_ble_pulses
    while True:
        now = time.ticks_ms()
        if time.ticks_diff(now, last_notify) >= 5000:
            count = pulse_count()
            ble.publish(sequence, count - _last_ble_pulses)
            _last_ble_pulses = count
            sequence += 1
            last_notify = now
        try:
            client, _address = listener.accept()
        except OSError:
            continue
        try:
            handle_client(client)
        except OSError as exc:
            print("HTTP client error:", exc)
        finally:
            client.close()
            gc.collect()


serve()
