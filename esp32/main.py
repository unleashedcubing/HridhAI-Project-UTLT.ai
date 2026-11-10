"""UTLT.ai ESP32 BLE meter with seven-day flash history.

Flow signal: GPIO27 through the 5 V/3.3 V converter. Power the pump separately.
The phone sets Unix time once over BLE. Keep the ESP32 powered during the week:
this board has no battery-backed clock, so power outages leave undated pulses.
"""

import bluetooth
import machine
import micropython
import os
import struct
import time

from history_store import HistoryStore

micropython.alloc_emergency_exception_buf(100)

FLOW_PIN = 27
SERVICE_UUID = bluetooth.UUID("930a7d60-8489-4b31-9cc6-64ee5e809100")
READING_UUID = bluetooth.UUID("930a7d60-8489-4b31-9cc6-64ee5e809101")
CONTROL_UUID = bluetooth.UUID("930a7d60-8489-4b31-9cc6-64ee5e809102")
HISTORY_UUID = bluetooth.UUID("930a7d60-8489-4b31-9cc6-64ee5e809103")
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
((reading_handle, control_handle, history_handle),) = radio.gatts_register_services((
    (SERVICE_UUID, (
        (READING_UUID, bluetooth.FLAG_READ | bluetooth.FLAG_NOTIFY),
        (CONTROL_UUID, bluetooth.FLAG_WRITE),
        (HISTORY_UUID, bluetooth.FLAG_NOTIFY),
    )),
))
radio.gatts_set_buffer(control_handle, 20)
radio.gatts_write(reading_handle, SESSION + struct.pack("<II", 0, 0))
connections = set()
pending_time = None
history_request_connection = None


def advertise():
    name = BLE_NAME.encode()
    payload = b"\x02\x01\x06" + bytes((len(name) + 1, 9)) + name
    radio.gap_advertise(100000, adv_data=payload)


def on_ble_event(event, data):
    global pending_time, history_request_connection
    if event == 1:  # Central connected.
        connections.add(data[0])
    elif event == 2:  # Central disconnected.
        connections.discard(data[0])
        advertise()
    elif event == 3 and data[1] == control_handle:  # GATT write.
        command = bytes(radio.gatts_read(control_handle))
        if len(command) == 5 and command[0] == 84:  # T + uint32 Unix seconds.
            pending_time = struct.unpack_from("<I", command, 1)[0]
        elif command == b"H":
            history_request_connection = data[0]


radio.irq(on_ble_event)
advertise()

store = HistoryStore()
sync_epoch = None
sync_tick = None


def current_epoch():
    if sync_epoch is None:
        return None
    return sync_epoch + time.ticks_diff(time.ticks_ms(), sync_tick) // 1000


def notify_history(connection, payload):
    if connection not in connections:
        return False
    try:
        radio.gatts_notify(connection, history_handle, payload)
        return True
    except OSError:
        return False


sequence = 0
last_total = pulse_count()
last_live_tick = time.ticks_ms()
last_flash_tick = last_live_tick
last_history_tick = last_live_tick
history_connection = None
history_rows = None
history_snapshot = 0
history_stage = ""
print("UTLT BLE meter", BLE_NAME, "id", DEVICE_ID, "GPIO", FLOW_PIN)

while True:
    now = time.ticks_ms()
    total = pulse_count()
    delta = max(0, total - last_total)
    last_total = total
    if delta:
        store.add(current_epoch(), delta)

    if pending_time is not None:
        sync_epoch = pending_time
        sync_tick = now
        pending_time = None
        store.prune(sync_epoch)

    if time.ticks_diff(now, last_flash_tick) >= 300000:
        store.flush()
        epoch = current_epoch()
        if epoch is not None:
            store.prune(epoch)
        last_flash_tick = now

    if history_request_connection is not None:
        connection = history_request_connection
        history_request_connection = None
        epoch = current_epoch()
        if epoch is not None and connection in connections:
            store.flush()
            history_rows = store.records(epoch)
            history_connection = connection
            history_snapshot = total
            history_stage = "start"

    if history_connection is not None and time.ticks_diff(now, last_history_tick) >= 45:
        last_history_tick = now
        if history_stage == "start":
            if notify_history(history_connection, b"S" + struct.pack("<I", history_snapshot)):
                history_stage = "rows"
            else:
                history_connection = None
        elif history_stage == "rows":
            try:
                bucket, count = next(history_rows)
                if not notify_history(history_connection, b"R" + struct.pack("<II", bucket, count)):
                    history_connection = None
            except StopIteration:
                history_stage = "end"
        elif history_stage == "end":
            if notify_history(history_connection, b"E" + struct.pack("<I", history_snapshot)):
                history_stage = "unknown"
            else:
                history_connection = None
        elif history_stage == "unknown":
            notify_history(history_connection, b"U" + struct.pack("<I", store.unknown_pulses & 0xFFFFFFFF))
            history_connection = None
            history_rows = None

    if time.ticks_diff(now, last_live_tick) >= 2000:
        packet = SESSION + struct.pack("<II", sequence, total & 0xFFFFFFFF)
        radio.gatts_write(reading_handle, packet)
        for connection in tuple(connections):
            try:
                radio.gatts_notify(connection, reading_handle, packet)
            except OSError:
                connections.discard(connection)
        sequence = (sequence + 1) & 0xFFFFFFFF
        last_live_tick = now

    time.sleep_ms(40)
