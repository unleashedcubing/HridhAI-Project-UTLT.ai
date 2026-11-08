"""UTLT.ai flow sensor: BLE to the computer, with Wi-Fi packet backup.

ESP32 MicroPython. Flow signal enters GPIO27 through a 5 V to 3.3 V converter.
The pump is not connected to or controlled by the ESP32 in this version.
"""

import bluetooth
import json
import machine
import micropython
import network
import socket
import struct
import time

import config

FLOW_PIN = 27
INTERVAL_MS = 5000
MAX_QUEUE = 120
MAX_PULSES_PER_PACKET = 100000
BLE_NAME = b"UTLT-Water"
BLE_SERVICE = bluetooth.UUID("930a7d60-8489-4b31-9cc6-64ee5e809100")
BLE_READING = bluetooth.UUID("930a7d60-8489-4b31-9cc6-64ee5e809101")

micropython.alloc_emergency_exception_buf(100)
_pulses = 0


def on_pulse(pin):
    global _pulses
    _pulses += 1


flow = machine.Pin(FLOW_PIN, machine.Pin.IN, machine.Pin.PULL_UP)
flow.irq(trigger=machine.Pin.IRQ_FALLING, handler=on_pulse)


class WaterBLE:
    def __init__(self):
        self.radio = bluetooth.BLE()
        self.radio.active(True)
        self.connection = None
        self.radio.irq(self.on_event)
        ((self.handle,),) = self.radio.gatts_register_services((
            (BLE_SERVICE, ((BLE_READING, bluetooth.FLAG_READ | bluetooth.FLAG_NOTIFY),)),
        ))
        self.advertise()

    def advertise(self):
        advertisement = b"\x02\x01\x06" + bytes((len(BLE_NAME) + 1, 9)) + BLE_NAME
        self.radio.gap_advertise(100000, adv_data=advertisement)

    def on_event(self, event, data):
        if event == 1:  # Central connected.
            self.connection = data[0]
        elif event == 2:  # Central disconnected.
            self.connection = None
            self.advertise()

    def publish(self, session_bytes, sequence, pulses):
        # 16 bytes fits the default BLE notification payload of 20 bytes.
        packet = session_bytes + struct.pack("<II", sequence, pulses)
        self.radio.gatts_write(self.handle, packet)
        if self.connection is not None:
            try:
                self.radio.gatts_notify(self.connection, self.handle, packet)
            except OSError as exc:
                print("BLE notification failed:", exc)


def post_packet(session, sequence, pulses):
    body = json.dumps({"session": session, "sequence": sequence, "pulses": pulses}).encode()
    address = socket.getaddrinfo(config.SERVER_HOST, config.SERVER_PORT)[0][-1]
    sock = socket.socket()
    sock.settimeout(3)
    try:
        sock.connect(address)
        request = (
            "POST /api/device/reading HTTP/1.1\r\n"
            "Host: %s\r\n"
            "Content-Type: application/json\r\n"
            "X-UTLT-Device-Token: %s\r\n"
            "Content-Length: %d\r\n"
            "Connection: close\r\n\r\n"
        ) % (config.SERVER_HOST, config.DEVICE_TOKEN, len(body))
        sock.write(request.encode() + body)
        response = sock.readline()
        if b" 200 " not in response:
            raise OSError("Server rejected packet: %s" % response)
    finally:
        sock.close()


def run():
    global _pulses
    wifi_enabled = (config.WIFI_SSID != "YOUR_WIFI_NAME" and
                    config.WIFI_PASSWORD != "YOUR_WIFI_PASSWORD" and
                    config.DEVICE_TOKEN != "SAME_LONG_RANDOM_TOKEN_AS_SERVER")

    session_bytes = machine.unique_id()[:4] + struct.pack("<I", time.ticks_ms())
    session = session_bytes.hex()  # Same ID on BLE and Wi-Fi for deduplication.
    ble = WaterBLE()
    wifi = network.WLAN(network.STA_IF) if wifi_enabled else None
    if wifi_enabled:
        wifi.active(True)
    queue = []
    sequence = 0
    last_sample = time.ticks_ms()
    next_wifi_try = last_sample
    next_upload = last_sample
    wifi_was_connected = False
    print("UTLT-Water BLE ready; flow GPIO27; pump not controlled")
    if not wifi_enabled:
        print("Wi-Fi backup disabled until config.py has your Wi-Fi details")

    while True:
        now = time.ticks_ms()
        connected = wifi_enabled and wifi.isconnected()
        if connected and not wifi_was_connected:
            print("Wi-Fi backup connected:", wifi.ifconfig()[0])
        wifi_was_connected = connected

        if wifi_enabled and not connected and time.ticks_diff(now, next_wifi_try) >= 0:
            try:
                wifi.disconnect()
                wifi.connect(config.WIFI_SSID, config.WIFI_PASSWORD)
            except OSError as exc:
                print("Wi-Fi retry:", exc)
            next_wifi_try = time.ticks_add(now, 15000)

        if time.ticks_diff(now, last_sample) >= INTERVAL_MS:
            elapsed = max(1, time.ticks_diff(now, last_sample))
            last_sample = now
            irq_state = machine.disable_irq()
            count = min(_pulses, MAX_PULSES_PER_PACKET)
            _pulses -= count
            machine.enable_irq(irq_state)
            ble.publish(session_bytes, sequence, count)
            if wifi_enabled:
                if len(queue) >= MAX_QUEUE:
                    queue.pop(0)
                    print("Wi-Fi backup queue full; oldest backup packet dropped")
                queue.append((sequence, count))
            print("Flow: %d pulses | %.2f L/min | BLE %s" %
                  (count, count * 60000 / (450 * elapsed),
                   "connected" if ble.connection is not None else "advertising"))
            sequence += 1

        if connected and queue and time.ticks_diff(now, next_upload) >= 0:
            packet_sequence, packet_count = queue[0]
            try:
                post_packet(session, packet_sequence, packet_count)
                queue.pop(0)
                print("Wi-Fi backup delivered packet", packet_sequence)
                next_upload = now
            except OSError as exc:
                print("Wi-Fi upload retry:", exc)
                next_upload = time.ticks_add(now, 5000)

        time.sleep_ms(50)


run()
