"""UTLT.ai water sensor -> local Python bridge (ESP32 MicroPython).

Sensor signal: GPIO27 through the 5 V/3.3 V level converter.
Optional pump MOSFET trigger: GPIO26. Pump stays off unless enabled in config.py.
"""

import json
import machine
import micropython
import network
import socket
import time

import config

FLOW_PIN = 27
PUMP_PIN = 26
SEND_EVERY_MS = 5000
PULSES_PER_LITRE = 450.0  # Display estimate; the server owns final calibration.
MAX_PULSES_PER_PACKET = 100000  # Matches the server's packet limit.

micropython.alloc_emergency_exception_buf(100)
_pulses = 0


def on_pulse(pin):
    global _pulses
    _pulses += 1


pump = machine.Pin(PUMP_PIN, machine.Pin.OUT, value=0)
flow = machine.Pin(FLOW_PIN, machine.Pin.IN, machine.Pin.PULL_UP)
flow.irq(trigger=machine.Pin.IRQ_FALLING, handler=on_pulse)


def connect_wifi():
    wifi = network.WLAN(network.STA_IF)
    wifi.active(True)
    if not wifi.isconnected():
        wifi.connect(config.WIFI_SSID, config.WIFI_PASSWORD)
        for _ in range(30):
            if wifi.isconnected():
                break
            time.sleep(1)
    if not wifi.isconnected():
        raise OSError("Wi-Fi connection failed")
    return wifi


def post_packet(session, sequence, pulses):
    body = json.dumps({"session": session, "sequence": sequence, "pulses": pulses}).encode()
    address = socket.getaddrinfo(config.SERVER_HOST, config.SERVER_PORT)[0][-1]
    sock = socket.socket()
    sock.settimeout(5)
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
    if (config.WIFI_SSID == "YOUR_WIFI_NAME" or
            config.DEVICE_TOKEN == "SAME_LONG_RANDOM_TOKEN_AS_SERVER"):
        raise ValueError("Fill in esp32/config.py before uploading")

    wifi = None
    session = machine.unique_id().hex() + "_%08x" % time.ticks_ms()
    sequence = 0
    pending = None
    sent_pulses = 0
    last_sample = time.ticks_ms()
    last_send = last_sample
    print("UTLT sensor ready on GPIO27; pump is OFF")

    try:
        while True:
            if wifi is None or not wifi.isconnected():
                pump.value(0)
                try:
                    wifi = connect_wifi()
                    print("Wi-Fi connected:", wifi.ifconfig()[0])
                    if config.PUMP_ON_AT_START:
                        pump.value(1)
                except OSError as exc:
                    print("Wi-Fi retry in 5 seconds:", exc)
                    time.sleep(5)
                    continue

            now = time.ticks_ms()
            if time.ticks_diff(now, last_send) < SEND_EVERY_MS:
                time.sleep_ms(50)
                continue
            last_send = now

            if pending is None:
                irq_state = machine.disable_irq()
                pending = min(_pulses, MAX_PULSES_PER_PACKET)
                _pulses -= pending
                machine.enable_irq(irq_state)
                elapsed_ms = max(1, time.ticks_diff(now, last_sample))
                flow_lpm = pending * 60000 / (PULSES_PER_LITRE * elapsed_ms)
                print("Sensor: %d pulses | %.2f L/min" % (pending, flow_lpm))
                last_sample = now

            try:
                post_packet(session, sequence, pending)
                sent_pulses += pending
                print("App updated | total: %.3f L" % (sent_pulses / PULSES_PER_LITRE))
                sequence += 1
                pending = None
            except OSError as exc:
                print("Upload failed; keeping pulses for retry:", exc)
    finally:
        pump.value(0)


run()
