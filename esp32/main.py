"""ESP32 MicroPython flow bridge for the UTLT local Python server.

Flow sensor: 5 V supply, signal through level shifter to GPIO27.
Pump MOSFET trigger: GPIO26. The pump defaults OFF in config.py.
"""

import json
import machine
import network
import socket
import time

import config

FLOW_PIN = 27
PUMP_PIN = 26
SEND_EVERY_MS = 5000
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
    wifi = connect_wifi()
    session = (machine.unique_id().hex() + "_%08x" % time.ticks_ms())
    sequence = 0
    pending = None
    last_send = time.ticks_ms()
    print("UTLT Wi-Fi bridge ready:", wifi.ifconfig()[0])
    if config.PUMP_ON_AT_START:
        pump.value(1)
    try:
        while True:
            if not wifi.isconnected():
                pump.value(0)
                wifi = connect_wifi()
                if config.PUMP_ON_AT_START:
                    pump.value(1)
            if time.ticks_diff(time.ticks_ms(), last_send) < SEND_EVERY_MS:
                time.sleep_ms(50)
                continue
            last_send = time.ticks_ms()
            if pending is None:
                irq_state = machine.disable_irq()
                pending = _pulses
                _pulses = 0
                machine.enable_irq(irq_state)
            try:
                post_packet(session, sequence, pending)
                print("Sent", pending, "pulses")
                sequence += 1
                pending = None
            except OSError as exc:
                print("Retrying packet:", exc)
    finally:
        pump.value(0)


run()
