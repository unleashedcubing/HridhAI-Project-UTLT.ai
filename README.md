# UTLT.ai water demo

## Phone pairing

The GitHub Pages app is the phone interface. The ESP32 runs `esp32/main.py` and sends flow readings over Bluetooth Low Energy (BLE) to **Chrome on Android** or **Bluefy on iPhone**. iPhone Chrome cannot use Web Bluetooth. After firmware is uploaded, the demo needs only the phone, ESP32, and power bank; the pump has its own power source. No computer bridge, home Wi-Fi, or device hotspot is needed.

1. Power the ESP32 from the USB power bank. It advertises as **UTLT-2C2C** on the current board.
2. Open the GitHub Pages app in **Chrome on Android** or **Bluefy on iPhone** over HTTPS, then open **Devices**.
3. Tap **Scan device QR** and point the camera at [this board's sticker](assets/UTLT-2C2C-pairing-qr.png). Allow camera access. In Bluefy, **Or use a camera photo** is available if live camera scanning does not work.
4. On the first connection, tap **Allow Bluetooth for UTLT-2C2C**, choose **UTLT-2C2C** in Chrome's Bluetooth prompt, and allow the connection. The chooser is filtered to that exact name, so unrelated Bluetooth devices should not appear. After permission is granted, the app remembers that browser device and tries to reconnect automatically when opened again.
5. The dashboard reads the meter every two seconds. The app always converts at **4,075 pulses per litre**. The observed 15.7–17.3 pulses/s and 38–41 s to fill 160 mL imply roughly 3,730–4,430 pulses/L; 4,075 is a working estimate, not a direct pulse count over one fill. Pump off should show no increase; pump on should make the total rise. In a recirculating demo, each lap is counted as simulated usage.

Chrome camera and Bluetooth permissions must be allowed. The scanned device ID is remembered on that phone. A new device requires one tap after scanning to open Chrome's Bluetooth chooser; scanning the QR alone cannot summon an Android OS pairing prompt from a website. Previously granted devices reconnect automatically when the app is visible and Chrome still has permission. Keep the page open for live readings. The dashboard starts empty until a device connects. For a sample dashboard, use **Devices → Explore with demo data** while disconnected; live data turns demo mode off automatically. Google account, Friends, and Family features require internet; the meter and water charts do not need them after the page loads. The QR contains the ESP32's public ID, **not** a Wi-Fi password. It identifies the device in the browser but does not provide secure ownership authentication; that is future product work.

The mini flow sensor is specified for 0.5–5 L/min. The app ignores intervals above 6 L/min and shows a sensor warning instead of adding impossible litres. If readings rose falsely during a demo, use **Devices → Clear this phone's demo readings**, then reconnect. If the warning appears only while the pump is on, test the pump on a separate charger or power bank while keeping the ESP32 on its own 5 V USB supply. Check the sensor red/black/yellow wiring, converter HV/LV rails, and common ground; an app filter does not repair a noisy electrical signal.

The Devices screen also shows the raw pulse count and pulses per second. A display of hundreds of pulses/s would point to false pulses or a very different sensor calibration, not a decimal place in the app.

### 160 mL timing check (USB serial)

For the laptop-only first-pulse test, leave the flow sensor wired and powered, turn the pump **off**, and run `./.venv/bin/python tools/calibrate_laptop.py` in a normal VS Code terminal. When it prints READY, turn on the pump and collect water at the sensor outlet. The timer starts on the first detected pulse. At exactly 160 mL, stop the pump and press `u` **without Enter** in that same Mac terminal. It prints elapsed seconds, pulse count, flow, and pulses/L. It automatically resets the ESP32 to the normal Bluetooth firmware afterward. Do not unplug and replug the sensor's exposed jumper wires to start the timer.

`esp32/calibrate_160ml.py` is a temporary interactive MicroPython script for a separate timing experiment. It does not alter the app's fixed 4,075 pulses/L conversion. Upload it to the ESP32 as `calibrate_160ml.py`, open the MicroPython REPL, interrupt `main.py` with Ctrl-C, then enter `import calibrate_160ml`. Reset the board afterward to resume the BLE app.

The optional `USE_MOSFET` setting in this script is **False** until the pump switch is wired. For the Robocraze 15A/400W module, follow the printed terminal labels: 5 V pump supply to `DC+`/`DC-`, pump leads to `OUT+`/`OUT-`, ESP32 GPIO26 to `TRIG`/`PWM+`, and ESP32 GND to the module's signal `GND` and pump supply negative. The ESP32 USB supply is separate from the pump's 5 V feed; never power the pump from GPIO26 or the 3V3 pin. Place a 1N4007 diode directly across the pump leads, stripe/band at pump positive and the other end at pump negative. It absorbs the motor's turn-off voltage spike. This diode is for on/off switching; do not use high-frequency PWM speed control with this setup. Check the actual module's labels before connecting power.

The current ~0.2–0.3 L/min demo flow is below the sensor's rated minimum, so 4,075 pulses/L is only a practical demo estimate, not a guarantee across other flows.

The BLE path has been checked from a computer: the board advertised `UTLT-2C2C`, connected, and returned a 16-byte meter packet. Camera scanning and the Bluetooth permission prompt still need a physical test on each phone/browser.

The browser-independent QR fallback uses [jsQR](https://github.com/cozmo/jsQR). Its bundled code and Apache 2.0 license are in `vendor/`.

## ESP32 setup

The board is already flashed with MicroPython. `esp32/main.py` is the BLE firmware that should be stored as `main.py` on the ESP32. To upload an update, find your serial port with `mpremote connect list`, then run these as separate commands from this folder:

```sh
mpremote connect /dev/cu.usbserial-0001 fs cp esp32/main.py :main.py
mpremote connect /dev/cu.usbserial-0001 reset
```

Replace the sample port if yours differs. The board prints its 12-digit hex device ID at boot. Generate a sticker for a different board with `python -m pip install 'qrcode[pil]'` and `python tools/generate_device_sticker.py DEVICE_ID`. Print the PNG and attach it to the enclosure.

## Flow sensor wiring

Follow pin labels and sensor wire colours. On the 830-hole breadboard, check whether each power rail is split in the middle. The earlier shared chat specified pins, not numbered holes.

| From | To |
| --- | --- |
| ESP32 VIN/5V | Sensor red and converter HV |
| ESP32 3V3 | Converter LV |
| ESP32 GND | Sensor black and converter GND |
| Sensor yellow | Converter HV1 |
| Converter LV1 | ESP32 GPIO27 |

Confirm VIN/5V is 5 V when USB powered. Use a matching adapter for the sensor's white connector. Keep all exposed electronics dry. The water loop is reservoir → separately powered pump → flow sensor inlet → flow sensor outlet → reservoir. The pump is not connected to or controlled by the ESP32.

## Meter protocol and data

BLE service UUID: `930a7d60-8489-4b31-9cc6-64ee5e809100`.
Read/notify characteristic UUID: `930a7d60-8489-4b31-9cc6-64ee5e809101`.
Each 16-byte packet is eight session bytes, a little-endian uint32 sequence, and a little-endian uint32 **cumulative pulse count**. The browser stores dated water increments in local storage so missed notifications do not double-count on reconnect. Readings are local to that phone. A flow sensor cannot identify whether water was used for a bath, food, or cleaning, so readings initially appear under **Misc**.

## Other modes and cloud features

`esp32/wifi_main.py` preserves the earlier ESP32-hosted Wi-Fi dashboard. `esp32/bridge_main.py`, `server.py`, `ble_bridge.py`, and `start_bridge.py` preserve the older computer bridge for development. Neither is needed for Android BLE pairing.

Firebase Google login, Friends, and Family are separate online features. To use them, enable Google sign-in and Firestore in the `utlt-ai1` Firebase project and deploy [firestore.rules](firestore.rules). The BLE demo works as a guest.
