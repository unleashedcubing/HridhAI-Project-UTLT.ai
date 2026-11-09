"""Temporary ESP32 / MicroPython 160 mL timing check over USB serial.

Upload as calibrate_160ml.py, open an interactive MicroPython REPL, stop main.py
with Ctrl-C, then type: import calibrate_160ml
This script does not replace main.py. Reset the board afterward to resume BLE.
"""

import machine
import micropython
import select
import sys
import time

FLOW_PIN = 27
PUMP_PIN = 26
USE_MOSFET = False  # Set True only after the MOSFET and flyback diode are wired.
TARGET_ML = 160
ESTIMATED_PULSES_PER_LITRE = 3260  # Provisional value from the earlier 160 mL run.
TARGET_PULSES = round(ESTIMATED_PULSES_PER_LITRE * TARGET_ML / 1000)

micropython.alloc_emergency_exception_buf(100)
pulses = 0


def on_pulse(_pin):
    global pulses
    pulses += 1


def pulse_count():
    irq_state = machine.disable_irq()
    current = pulses
    machine.enable_irq(irq_state)
    return current


def parse_actual_ms(raw):
    """SSMMM: 36500 means 36 seconds and 500 milliseconds."""
    raw = raw.strip()
    if len(raw) != 5 or not raw.isdigit():
        return None
    elapsed = int(raw[:2]) * 1000 + int(raw[2:])
    return elapsed if elapsed > 0 else None


sensor = machine.Pin(FLOW_PIN, machine.Pin.IN, machine.Pin.PULL_UP)
sensor.irq(trigger=machine.Pin.IRQ_FALLING, handler=on_pulse)
pump = machine.Pin(PUMP_PIN, machine.Pin.OUT, value=0) if USE_MOSFET else None
keyboard = select.poll()
keyboard.register(sys.stdin, select.POLLIN)

try:
    print("160 mL timing check; GPIO27 flow sensor")
    print("Provisional target: %d pulses. This is only an estimate." % TARGET_PULSES)
    print("Prepare a measuring cup at the sensor outlet.")
    while input("Type u and press Enter to start: ").strip().lower() != "u":
        print("Type u to start.")

    start_pulses = pulse_count()
    start_ms = time.ticks_ms()
    if pump:
        pump.value(1)
    else:
        print("Timer started. Start the manually powered pump now; any delay affects timing.")
    print("Timer running. Stop the pump when the cup ACTUALLY reaches 160 mL.")
    print("If it reaches 160 mL before DONE, type your time anyway.")

    done_ms = None
    actual_ms = None
    last_report_ms = start_ms
    while actual_ms is None:
        now = time.ticks_ms()
        count = pulse_count() - start_pulses
        if done_ms is None and count >= TARGET_PULSES:
            done_ms = time.ticks_diff(now, start_ms)
            if pump:
                pump.value(0)
            print("DONE (device estimate): %d.%03d s, %d pulses" %
                  (done_ms // 1000, done_ms % 1000, count))
            print("Enter your actual 160 mL time as SSMMM, e.g. 36500 = 36.500 s.")
            if not pump:
                print("Stop the pump at the real 160 mL mark before entering your time.")

        if time.ticks_diff(now, last_report_ms) >= 1000 and done_ms is None:
            print("%d.%03d s | %d / %d pulses" %
                  (time.ticks_diff(now, start_ms) // 1000,
                   time.ticks_diff(now, start_ms) % 1000, count, TARGET_PULSES))
            last_report_ms = now

        if keyboard.poll(50):
            entry = sys.stdin.readline().strip()
            actual_ms = parse_actual_ms(entry)
            if actual_ms is None:
                print("Use exactly five digits SSMMM; 36500 means 36.500 s.")

    if pump:
        pump.value(0)
    measured_pulses = pulse_count() - start_pulses
    actual_lpm = TARGET_ML * 60 / actual_ms
    print("Your measured 160 mL time: %d.%03d s" %
          (actual_ms // 1000, actual_ms % 1000))
    print("Actual flow: %.3f L/min (about %.1f mL/s)" %
          (actual_lpm, TARGET_ML * 1000 / actual_ms))
    print("Device pulse count at entry: %d" % measured_pulses)
    if done_ms is not None:
        print("Device estimate differed from your time by %d ms." %
              (done_ms - actual_ms))
    if measured_pulses > 0:
        print("If the pump stopped at EXACTLY 160 mL, use %.0f pulses/L in the app." %
              (measured_pulses * 1000 / TARGET_ML))
    print("This changes the litres conversion, not the physical pump speed or pulse rate.")
finally:
    if pump:
        pump.value(0)
    sensor.irq(handler=None)
