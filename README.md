# UTLT.ai water demo

UTLT.ai is a HridhAI 2026 team project. The current build measures water in a recirculating demo and shows the readings in a phone web app. Gas and electricity are planned extensions, not working measurements yet. The six-page [project report](reports/UTLT_Project_Report_16_Nov_2026.docx) records the build and each member's contribution through 16 November.

## Open the demo

- [Live app](https://unleashedcubing.github.io/HridhAI-Project-UTLT.ai/) and [page map](https://unleashedcubing.github.io/HridhAI-Project-UTLT.ai/screens.html). The map lists all 23 screens and subviews and is also linked from **Account → Help & support**.
- For live readings, pair the ESP32 in **Devices**. For a walkthrough without hardware, turn on **Devices → Explore with demo data**, then switch between Leak detection, Water trends and AI water coach on **Home → Water**. Turning demo data off hides the scenarios and their switcher.
- Open **Niro** to ask for a forecast, water-use split, chart or table. Tap **Download to use** to open chat. The SmolLM2 model file is 137 MB and runs in your browser. On first use, Niro asks about your routine and suggests an editable water goal. This is the only onboarding questionnaire.
- Find language, appearance and help in **Account**. Meter calibration stays in **Devices**. The usage ring blends toward red near the goal and the water card fills with measured use. Gas and Electricity show empty rings and unavailable reporting until monitoring is enabled. Google Home and Apple Home remain future integrations.

## Team and credits

| Member | Work recorded so far |
| --- | --- |
| Hrishi Varun | Original water-conservation direction and research; first Figma screens; ESP32 MicroPython, circuit build, pulse calibration and troubleshooting; local AI direction and integration; enclosure work with Saketh. |
| Saketh | Joint enclosure design with Hrishi, from early SketchUp trials to the Shapr3D case and fit checks. |
| Armaan | HTML and JavaScript navigation, Firebase profiles, Google sign-in, and the Friends idea that led to discussion of family monitoring. |
| S. Vibhav Ram | Physical demo operation, team coordination and testing support. His contribution report describes this as ongoing work. |
| Abhinav | Four rounds of app interface and accessibility work across `styles.css`, `app.js`, `data.js` and `index.html`: light/dark layouts, dashboard and charts, status and tip cards, phone-size fixes, keyboard focus, reduced-motion support, and form improvements. His supplied summary does not claim backend implementation. |

The team used Figma, Shapr3D, VS Code, MLX and AI-assisted coding tools during development. The hardware readings and AI suggestions still need independent physical validation.

### Development and source credit

Claude Code and OpenAI Codex were used to debug and improve the source code. Source headers marked **AI-assisted** identify files with substantial AI-assisted changes; they do not replace the team members' design, wiring, testing or coding credits. The bundled third-party QR decoder is credited separately.

The app uses two distinct models: [SmolLM2 135M Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct) for optional on-device chat explanations, and a local [scikit-learn random forest](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html) for tentative activity labels. Meter totals, goals and forecasts are calculated in code. The training records are simulated, so neither model has demonstrated real-household activity accuracy.

Open-source code and runtimes used: [MicroPython](https://micropython.org/) on the ESP32, [jsQR](https://github.com/cozmo/jsQR) for QR image decoding (bundled with its [Apache 2.0 license](vendor/jsQR.LICENSE)), [Transformers.js](https://github.com/huggingface/transformers.js) for browser inference, [MLX LM](https://github.com/ml-explore/mlx-lm) for fine-tuning, and [ONNX Runtime](https://onnxruntime.ai/) for model validation and quantization. Firebase provides account and cloud features. The [Qwen3 base model](https://huggingface.co/Qwen/Qwen3-0.6B) is Apache 2.0 licensed.

The report's external evidence comes from the [Central Ground Water Board's 2024 Telangana assessment](https://www.cgwb.gov.in/cgwbpnm/public/uploads/documents/1743586655783642514file.pdf). Future gas and electricity modules should use approved meter outputs; examples are [Itron's gas-meter pulse sensor](https://apac.itron.com/pt/products/cyble-sensor) and [Landis+Gyr's E220 optical pulse specification](https://www.landisgyr.com/product/landisgyr-e220/?download=205084&filename=%2Fwebfoo%2Fwp-content%2Fuploads%2F2018%2F08%2FD000063493-E220-AMxD-Technical-Data-en-b.pdf). These are design references, not parts in the current prototype.

## Phone pairing

The GitHub Pages app is the phone interface. The ESP32 runs `esp32/main.py` and sends flow readings over Bluetooth Low Energy (BLE) to **Chrome on Android** or **Bluefy on iPhone**. iPhone Chrome cannot use Web Bluetooth. After firmware is uploaded, the demo needs only the phone, ESP32, and power bank; the pump has its own power source. No computer bridge, home Wi-Fi, or device hotspot is needed.

1. Power one ESP32 from the USB power bank. It advertises as **UTLT-2C2C** or **UTLT-A014**, depending on the board.
2. Open the GitHub Pages app in **Chrome on Android** or **Bluefy on iPhone** over HTTPS, then open **Devices**.
3. Tap **Scan device QR** and point the camera at the sticker matching the powered board: [2C2C](assets/UTLT-2C2C-pairing-qr.png) or [A014](assets/UTLT-A014-pairing-qr.png). Allow camera access. In Bluefy, **Or use a camera photo** is available if live camera scanning does not work.
4. On the first connection, tap **Allow Bluetooth** and choose the matching UTLT device in the chooser. The chooser is filtered to that device name. After permission is granted, the app remembers that browser device and tries to reconnect automatically when opened again.
5. The dashboard reads the meter every two seconds. The provisional conversion is **3,000 pulses per litre**. The newer 10–14 pulses/s and earlier 38–41 s to fill 160 mL imply about 2,375–3,588 pulses/L; using their midpoints gives 2,963 pulses/L, rounded to 3,000. The outer combinations imply roughly **−20.8% to +19.6%** indicated-volume error at this slow demo flow. These are unpaired ranges, not a measured accuracy specification, and error may be larger at other flows. Stored device readings are rescaled when the browser updates from the older conversion. Pump off should show no increase; pump on should make the total rise. In a recirculating demo, each lap is counted as simulated usage.

Chrome camera and Bluetooth permissions must be allowed. The scanned device ID is remembered on that phone. A new device requires one tap after scanning to open Chrome's Bluetooth chooser; scanning the QR alone cannot summon an Android OS pairing prompt from a website. Previously granted devices reconnect automatically when the app is visible and Chrome still has permission. Keep the page open for live readings. On iPhone Bluefy, pairing opens Home without Google sign-in. The profile and readings stay in Bluefy on that phone; there is no Firebase account or Family sharing. Android Chrome still uses Google sign-in after pairing. For a sample dashboard before pairing, use **Devices → Explore with demo data**; live data turns demo mode off automatically. The QR contains the ESP32's public ID, **not** a Wi-Fi password. It identifies the device in the browser but does not provide secure ownership authentication; that is future product work.

The mini flow sensor is specified for 0.5–5 L/min. The app ignores intervals above 6 L/min and shows a sensor warning instead of adding impossible litres. If readings rose falsely during a demo, use **Devices → Pair a device → Clear saved water readings**, then reconnect. If the warning appears only while the pump is on, test the pump on a separate charger or power bank while keeping the ESP32 on its own 5 V USB supply. Check the sensor red/black/yellow wiring, converter HV/LV rails, and common ground; an app filter does not repair a noisy electrical signal.

The Devices screen also shows the raw pulse count and pulses per second. A display of hundreds of pulses/s would point to false pulses or a very different sensor calibration, not a decimal place in the app.

### 160 mL timing check (USB serial)

For the laptop-only first-pulse test, leave the flow sensor wired and powered, turn the pump **off**, and run `./.venv/bin/python tools/calibrate_laptop.py` in a normal VS Code terminal. When it prints READY, turn on the pump and collect water at the sensor outlet. The timer starts on the first detected pulse. At exactly 160 mL, stop the pump and press `u` **without Enter** in that same Mac terminal. It prints elapsed seconds, pulse count, flow, and pulses/L. It automatically resets the ESP32 to the normal Bluetooth firmware afterward. Do not unplug and replug the sensor's exposed jumper wires to start the timer.

`esp32/calibrate_160ml.py` is a temporary interactive MicroPython script for a separate timing experiment. Its 3,000 pulses/L target is provisional and does not change the live BLE firmware, which sends raw pulse counts. Upload it to the ESP32 as `calibrate_160ml.py`, open the MicroPython REPL, interrupt `main.py` with Ctrl-C, then enter `import calibrate_160ml`. Reset the board afterward to resume the BLE app.

The optional `USE_MOSFET` setting in this script is **False** until the pump switch is wired. For the Robocraze 15A/400W module, follow the printed terminal labels: 5 V pump supply to `DC+`/`DC-`, pump leads to `OUT+`/`OUT-`, ESP32 GPIO26 to `TRIG`/`PWM+`, and ESP32 GND to the module's signal `GND` and pump supply negative. The ESP32 USB supply is separate from the pump's 5 V feed; never power the pump from GPIO26 or the 3V3 pin. Place a 1N4007 diode directly across the pump leads, stripe/band at pump positive and the other end at pump negative. It absorbs the motor's turn-off voltage spike. This diode is for on/off switching; do not use high-frequency PWM speed control with this setup. Check the actual module's labels before connecting power.

The current ~0.2–0.3 L/min demo flow is below the sensor's rated 0.5 L/min minimum, so 3,000 pulses/L is only a working demo estimate. [Robocraze lists 450 pulses/L](https://robocraze.com/products/mini-water-flow-sensor-white) for this product in its rated range; the large difference from our observation is a reason to verify wiring and repeat a measured-volume test, not a reason to call 3,000 a sensor specification.

Both boards run MicroPython v1.29.0. The older `UTLT-2C2C` has the earlier BLE meter firmware; `UTLT-A014` has the seven-day history firmware. In a controlled swap, both ESP32 boards counted flow on the **2C2C breadboard setup** and neither counted on the **A014 breadboard setup**. That isolated the fault to the second breadboard circuit rather than the A014 ESP32 or its BLE firmware. The team has since reported the problem **fixed**; the exact bad connection has not been recorded. Keep the checks for the next rebuild: sensor red must reach a live 5 V rail, black shared ground, yellow converter HV1, LV1 GPIO27, and converter HV/LV 5 V/3V3. Check split rails, soldered converter headers and five-hole strips across the centre trench. Never apply 5 V directly to GPIO27, and use only one ESP32 at a time. Both boards were placed in deep sleep after the earlier inspection; unplug USB for complete power-off and press EN after repowering.

The browser-independent QR fallback uses [jsQR](https://github.com/cozmo/jsQR). Its bundled code and Apache 2.0 license are in `vendor/`.

The supplied wordmark is preserved in `assets/utlt-logo-original.png`. `assets/utlt-logo-styles.png` compares monochrome, water-blue, and light-background treatments. The small U-and-orbit mark is used for the favicon, loading screen, and installable app icon.

## ESP32 setup

The connected ESP32-D0WD-V3 (4 MB flash, ID `c82e18bfa014`) was flashed with official MicroPython v1.29.0. Both meter files were uploaded and a Bluetooth read returned advancing sequence numbers. For future updates, find the serial port with `mpremote connect list`, then run these commands from this folder:

```sh
mpremote connect /dev/cu.usbserial-0001 fs cp esp32/history_store.py :history_store.py
mpremote connect /dev/cu.usbserial-0001 fs cp esp32/main.py :main.py
mpremote connect /dev/cu.usbserial-0001 reset
```

Replace the sample port if yours differs. Upload `history_store.py` before resetting; the new `main.py` imports it. The board prints its 12-digit hex device ID at boot. Generate a sticker for a different board with `python -m pip install 'qrcode[pil]'` and `python tools/generate_device_sticker.py DEVICE_ID`. Print the PNG and attach it to the enclosure.

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

The sensor's **red wire powers its Hall-effect circuit**. If that wire is loose or lands on an unpowered half of a split breadboard rail, Bluetooth can still connect while the pulse count stays at zero. Black is the common return; yellow is the pulse output and must pass through the level converter before GPIO27.

## Meter protocol and data

BLE service UUID: `930a7d60-8489-4b31-9cc6-64ee5e809100`. Live read/notify: `...9101`; control write: `...9102`; history notify: `...9103`.

The 16-byte live packet is eight session bytes, a little-endian uint32 sequence, and a little-endian uint32 cumulative pulse count. On connection, the phone writes `T` plus four-byte Unix seconds, then `H` to request history. History notifications are `S` plus snapshot pulse count, `R` plus Unix bucket start and bucket pulses, `E` plus snapshot count, then `U` plus pulses that had no known time. All integers are little-endian. The app merges five-minute buckets by timestamp and replaces overlapping local live estimates, avoiding double counting.

The ESP32 saves nonempty five-minute pulse buckets to flash, retains the last seven days, and transfers them over BLE when the phone reconnects. The board must **remain powered** after the phone first sets its clock. It has no battery-backed real-time clock: after a power loss, any pulses before the next phone time sync can be saved only as an undated total and cannot be put on the correct day. Up to five minutes of the active bucket can be lost if power fails before a flash write. An external RTC and backup power would be required to guarantee accurate dates across outages. This firmware boots and serves live packets on the physical ESP32. Time sync and the empty-history S/E/U transfer were verified over BLE. Nonzero seven-day history and Android phone pairing still need a physical end-to-end test.

Readings and survey answers are local to the phone. A single flow sensor cannot identify bath, food, or cleaning: unconfirmed use appears under **Misc**. The free local model in `training/` suggests labels from amount, time, duration and survey answers. It was trained on 1,000 **synthetic** seven-day households, with separate labeled and unlabeled files; synthetic holdout results are in `training/validation.json`. Real-world accuracy is unknown. After the household survey, the app starts a seven-day observation. It flags uncertain use only after at least **16 minutes of sustained measured flow**; five-minute history buckets can detect this conservatively but cannot prove truly uninterrupted flow. Reviews appear after **9 PM on the same day** during those first seven days and again on the first three days of each month. Confirmed labels stay on that phone and adapt similar suggestions.

Niro compares today's use so far with the median at the same local time on at least three earlier measured days. It excludes days without readings rather than treating them as zero. Niro’s Today and Recent use cards, charts and common answers use app arithmetic. General explanations can use the optional downloadable model. During a live Bluetooth session, 16 minutes of continuously detected flow prompts a check of taps and the pump; it cannot diagnose a leak. Demo readings are labeled and do not include events later than the current time.

The **Recent use** mode reports the average and goal count from completed measured days, with a trend after six days. Bluefy creates a phone-only profile automatically after pairing; Android uses Google sign-in. Niro onboarding runs after the first model download and is independent of pairing. Live meter updates no longer redraw its form while a person is typing.

The printable enclosure files and adjustable source are in [enclosure/](enclosure/README.md). The flow sensor mounts outside the dry ESP32 tray; verify physical dimensions before printing.

### Niro

Niro takes inspiration from ChatGPT Pets. Hrishi asked Codex to design Niro as an original pixel-art water droplet. The avatar waves on tap and reacts to app activity using SVG and CSS with reduced-motion support.

Niro Summary sits below daily usage and prioritises a possible leak, a projected goal overrun, a pace change, or today’s breakdown. The Niro tab shows inline charts and tables from the readings. Chat stays in memory until you reload or choose **New chat**. The transcript is excluded from online translation. The existing Today and Recent use views retain their original calculations. Niro can estimate by midnight or answer an explicit 8 pm question.

To unlock chat, tap **Download to use**. A browser worker runs the 8-bit SmolLM2 135M Instruct ONNX model through Transformers.js and WebAssembly. The first download requires internet. Answers and meter data stay in the browser during inference. Meter tracking, reports and Niro Summary work before the download. The earlier fine-tuned Qwen model is documented in [training/llm/README.md](training/llm/README.md).

The quick tour adapts Armaan’s standalone app. His original assistant sent chat through Render to an OpenAI-compatible Supabase function. This build uses the local model described above.

For developers, [`niro.js`](niro.js) holds the avatar, summary selection and chart/table rendering. [`niro.css`](niro.css) controls the avatar motion and UI theme. [`llm-worker.js`](llm-worker.js) runs the optional model. [`screens.html`](screens.html) contains the page map.

### First-week learning

For seven calendar days after setup, Niro can highlight a high-use hour in water readings and ask what happened. The answer is converted to local activity labels. One confirmed category helps tune the existing classifier. Combined labels are learned from similar hours and volumes without splitting their litres. **I don’t remember** skips the example. Questions and answers are part of setup and review, while chat transcripts stay in memory.

After the week ends, Niro shows a typical-day forecast from the median of at least three recorded days and shows the observed range. Gaps in meter coverage can affect the result.

## Other modes and cloud features

`esp32/wifi_main.py` preserves the earlier ESP32-hosted Wi-Fi dashboard. `esp32/bridge_main.py`, `server.py`, `ble_bridge.py`, and `start_bridge.py` preserve the older computer bridge for development. Neither is needed for Android BLE pairing.

Google sign-in is used on Android. Bluefy skips Google and creates a local profile after pairing. That profile has no cloud sync, Friends or Family access and should not be treated as authenticated device ownership. Enable Google sign-in and Firestore in the `utlt-ai1` Firebase project and deploy [firestore.rules](firestore.rules) for Android cloud features. The BLE meter itself can still send readings without Wi-Fi.
