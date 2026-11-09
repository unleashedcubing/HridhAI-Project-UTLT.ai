"""No-input 36-second, 160 mL flow calibration for ESP32 MicroPython.

Run from the Mac terminal with:
    ./.venv/bin/mpremote connect /dev/cu.usbserial-0001 run esp32/calibrate_36s.py

Start collecting water when START appears. This does not replace main.py.
"""

import machine
import micropython
import time

FLOW_PIN = 27
MEASURED_ML = 160
RUN_SECONDS = 36
_pulses = 0

micropython.alloc_emergency_exception_buf(100)


def on_pulse(_pin):
    global _pulses
    _pulses += 1


pin = machine.Pin(FLOW_PIN, machine.Pin.IN, machine.Pin.PULL_UP)
pin.irq(trigger=machine.Pin.IRQ_FALLING, handler=on_pulse)

try:
    print("Prepare the cup at the sensor outlet; counting starts in 3 seconds.")
    for remaining in (3, 2, 1):
        print(remaining)
        time.sleep(1)
    irq_state = machine.disable_irq()
    start_pulses = _pulses
    machine.enable_irq(irq_state)
    print("START: collect water now")
    for second in range(1, RUN_SECONDS + 1):
        time.sleep(1)
        if second % 6 == 0:
            print("%d / 36 s" % second)
    irq_state = machine.disable_irq()
    pulses = _pulses - start_pulses
    machine.enable_irq(irq_state)
    print("DONE: 36 seconds; stop collecting now")
    print("Pulses: %d" % pulses)
    print("Measured flow: %.3f L/min" % (MEASURED_ML * 60 / (RUN_SECONDS * 1000)))
    print("IF the cup contains exactly 160 mL: set the app to %.0f pulses/L" %
          (pulses * 1000 / MEASURED_ML))
    if pulses == 0:
        print("No pulses detected: check GPIO27, sensor power, and signal wiring.")
    print("If the cup volume differs from 160 mL, do not use this calibration.")
finally:
    pin.irq(handler=None)
