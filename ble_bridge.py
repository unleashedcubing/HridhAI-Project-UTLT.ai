"""Optional BLE receiver for the UTLT local Python bridge.

The ESP32 sends the same session/sequence/pulse packet over BLE and Wi-Fi.
The server's existing duplicate check ensures that each packet counts once.
"""

import asyncio
import struct

SERVICE_UUID = "930a7d60-8489-4b31-9cc6-64ee5e809100"
READING_UUID = "930a7d60-8489-4b31-9cc6-64ee5e809101"
DEVICE_NAME = "UTLT-Water"


def decode_packet(data):
    raw = bytes(data)
    if len(raw) != 16:
        raise ValueError("Expected a 16-byte UTLT BLE packet")
    sequence, pulses = struct.unpack("<II", raw[8:])
    return {"session": raw[:8].hex(), "sequence": sequence, "pulses": pulses}


async def receive_forever(record_packet):
    from bleak import BleakClient, BleakScanner

    def matches(device, advertisement):
        return (device.name == DEVICE_NAME or advertisement.local_name == DEVICE_NAME or
                SERVICE_UUID in advertisement.service_uuids)

    def on_reading(_characteristic, data):
        try:
            packet = decode_packet(data)
            result = record_packet(packet)
            if not result["duplicate"]:
                print("BLE: %d pulses in packet %d" % (packet["pulses"], packet["sequence"]))
        except ValueError as exc:
            print("Ignored invalid BLE reading:", exc)

    while True:
        try:
            device = await BleakScanner.find_device_by_filter(matches, timeout=10)
            if device is None:
                print("BLE: waiting for UTLT-Water")
            else:
                async with BleakClient(device) as client:
                    print("BLE connected to", device.name or DEVICE_NAME)
                    await client.start_notify(READING_UUID, on_reading)
                    on_reading(None, await client.read_gatt_char(READING_UUID))
                    while client.is_connected:
                        await asyncio.sleep(1)
                    print("BLE disconnected; scanning again")
        except Exception as exc:
            print("BLE retry:", exc)
        await asyncio.sleep(3)


def start(record_packet):
    import threading

    def runner():
        asyncio.run(receive_forever(record_packet))

    thread = threading.Thread(target=runner, name="utlt-ble", daemon=True)
    thread.start()
    return thread
