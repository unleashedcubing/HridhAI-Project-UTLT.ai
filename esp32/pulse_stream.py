"""Temporary USB pulse stream for the laptop's 160 mL calibration tool."""

import machine
import micropython
import time

micropython.alloc_emergency_exception_buf(100)
pulses = 0


def on_pulse(_pin):
    global pulses
    pulses += 1


sensor = machine.Pin(27, machine.Pin.IN, machine.Pin.PULL_UP)
sensor.irq(trigger=machine.Pin.IRQ_FALLING, handler=on_pulse)
print("READY: keep the sensor connected; turn the pump on when ready")
while True:
    irq_state = machine.disable_irq()
    count = pulses
    machine.enable_irq(irq_state)
    print("COUNT:%d" % count)
    time.sleep_ms(100)
