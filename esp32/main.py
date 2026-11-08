"""UTLT.ai ESP32 BLE meter for the Android Chrome GitHub Pages app.

Flow sensor signal: GPIO27 through the 5 V to 3.3 V level converter.
Power the pump separately. This board does not switch the pump.
"""

import bluetooth
import machine
import micropython
import os
import struct
import time

micropython.alloc_emergency_exception_buf(100)

FLOW_PIN = 27
SERVICE_UUID = bluetooth.UUID("930a7d60-8489-4b31-9cc6-64ee5e809100")
READING_UUID = bluetooth.UUID("930a7d60-8489-4b31-9cc6-64ee5e809101")
DEVICE_ID = machine.unique_id().hex()
BLE_NAME = "UTLT-" + DEVICE_ID[-4:].upper()
SESSION = machine.unique_id()[:4] + os.urandom(4)

_pulses = 0


def on_pulse(_pin):
    global _pulses
    _pulses += 1


sensor = machine.Pin(FLOW_PIN, machine.Pin.IN, machine.Pin.PULL_UP)
sensor.irq(trigger=machine.Pin.IRQ_FALLING, handler=on_pulse)


def pulse_count():
    irq_state = machine.disable_irq()
    count = _pulses
    machine.enable_irq(irq_state)
    return count


radio = bluetooth.BLE()
radio.active(True)
radio.config(gap_name=BLE_NAME)
((reading_handle,),) = radio.gatts_register_services((
    (SERVICE_UUID, ((READING_UUID, bluetooth.FLAG_READ | bluetooth.FLAG_NOTIFY),)),
))
connections = set()


def advertise():
    name = BLE_NAME.encode()
    payload = b"\x02\x01\x06" + bytes((len(name) + 1, 9)) + name
    radio.gap_advertise(100000, adv_data=payload)


def on_ble_event(event, data):
    if event == 1:  # Central connected.
        connections.add(data[0])
    elif event == 2:  # Central disconnected.
        connections.discard(data[0])
        advertise()


radio.irq(on_ble_event)
advertise()

sequence = 0
print("UTLT BLE meter", BLE_NAME, "id", DEVICE_ID, "GPIO", FLOW_PIN)
while True:
    total = pulse_count()
    # 8-byte session, uint32 sequence, uint32 cumulative pulse count.
    packet = SESSION + struct.pack("<II", sequence, total)
    radio.gatts_write(reading_handle, packet)
    for connection in tuple(connections):
        try:
            radio.gatts_notify(connection, reading_handle, packet)
        except OSError:
            connections.discard(connection)
    sequence = (sequence + 1) & 0xFFFFFFFF
    time.sleep_ms(2000)
