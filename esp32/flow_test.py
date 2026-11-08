"""Read the mini water flow sensor on ESP32 GPIO27; leave the pump disconnected."""

from machine import Pin, disable_irq, enable_irq
from time import sleep_ms, ticks_diff, ticks_ms
import micropython

micropython.alloc_emergency_exception_buf(100)

FLOW_PIN = 27
PULSES_PER_LITRE = 450.0  # Seller's starting value; calibrate with measured water.
pulses = 0


def on_pulse(pin):
    global pulses
    pulses += 1


sensor = Pin(FLOW_PIN, Pin.IN, Pin.PULL_UP)
sensor.irq(trigger=Pin.IRQ_FALLING, handler=on_pulse)
last_pulses = 0
last_time = ticks_ms()

print("UTLT flow sensor ready; pump should be disconnected")
while True:
    sleep_ms(1000)
    irq_state = disable_irq()
    current = pulses
    enable_irq(irq_state)
    now = ticks_ms()
    elapsed_ms = max(1, ticks_diff(now, last_time))
    interval = current - last_pulses
    litres = current / PULSES_PER_LITRE
    litres_per_minute = interval * 60000 / (PULSES_PER_LITRE * elapsed_ms)
    print("Pulses: %d | Flow: %.2f L/min | Total: %.3f L" %
          (current, litres_per_minute, litres))
    last_pulses = current
    last_time = now
