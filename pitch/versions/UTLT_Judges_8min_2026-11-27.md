# UTLT.ai | Eight-minute team speech

Brackets are silent stage cues. Speak at roughly 120–125 words per minute. The timings include slide changes, four demo clicks and handoffs. Slide 27 is the sources appendix.

## 0:00–0:55 | Saketh · Slides 1–6

[Show the cover. Advance through the agenda and team. Pause on Research.]

Think about the last time someone at home asked, “Did we leave a tap running?” By the time the bill comes, that moment is long gone.

We chose this topic because of the water crisis. Reading the Telangana groundwater assessment made it feel close to home. It gave us the wider picture, but we still had a practical question. Could a family see what was happening at its tap while there was time to do something about it?

We’re Saketh, Armaan, Vibhav, Abhinav and Hrishi. We started with water because we could build, measure and test it ourselves. That became UTLT.ai.

## 0:55–1:40 | Abhinav · Slides 7–8

[On the interface slide, point to the goal and chart.]

Hrishi sketched light and dark layouts in Figma. Armaan worked on navigation and accounts, and I refined the charts, contrast and layouts for smaller phones. We wanted a family to open the app and see two things straight away. How much water have we used, and how close are we to our goal?

One problem was that the activity chart looked as certain as the litre count. We separated usage by time from usage by activity. When we don’t know what the water was used for, it stays in Misc.

## 1:40–2:30 | Vibhav · Slides 9–10

[Point to the reservoir, flow meter and ESP32. The enclosure photos come later.]

We used one reservoir because this is a loop. The pump pushes water through the inline meter, and the outlet brings that same water back. Every pass counts as water going through the meter.

The sensor sends five-volt pulses. A level converter brings the signal down to the ESP32’s three-point-three-volt input. MicroPython counts the pulses, and Bluetooth sends the count to the phone. The phone turns the difference into estimated litres. We timed a 160-millilitre fill and used about three thousand pulses per litre. The rig ran slower than the sensor’s rated range, so we’ll repeat the calibration at several flows.

## 2:30–3:37 | Hrishi · Slides 11–12

[Show the model-training slide, then Niro’s first week.]

The meter knows how much water moved. It doesn’t know what anyone was doing. To get started, we trained a random forest on simulated routines from eight hundred households and held two hundred simulated homes back for testing. Those results give us a baseline. We still need household data to find out how well it works in practice.

Niro runs SmolLM2 on the device. After the download, it asks about your routine and suggests a daily goal you can change. During the first seven days, it can highlight an hour and ask what happened. You can say “showering and cooking,” or “I don’t remember.” Niro learns from confirmed labels and keeps the measured litres together. After the week, it can estimate a typical day from the readings it actually got.

## 3:37–5:02 | Abhinav · Slides 13–16

[Say that the next three slides use sample data. Click the controls on each slide.]

Here are three ways the app can help. First, leak detection. We start at fifteen minutes of continuous flow. Advance one minute and it asks us to check for a possible leak. The ring goes from 160 to 163 litres. Those three litres stay in the total when we simulate stopping the flow. A tap could have been running on purpose, so the app asks you to check.

[On Water trends, click Explain the trend.]

Next, water trends. Six sample days met the 350-litre goal. Day seven reached 365. Look at the comparison. The first three days averaged 262 litres, and the last three averaged 344. That gives us more to go on than the last day alone.

[On AI water coach, click What can I do now?]

Finally, the coach. At four in the afternoon, this sample home has used 240 litres in six hours. If that pace holds, it reaches 400 litres by eight, 50 over the goal. The app shows the calculation and suggests turning off the tap while scrubbing.

## 5:02–5:42 | Vibhav · Slides 17–19

[Show the breadboard and enclosure photos. Trace the path back to the reservoir.]

One ESP32 connected over Bluetooth but still showed zero flow. We swapped boards between the breadboards. Both counted on one setup and neither counted on the other. That narrowed it down to the circuit.

The case was a separate job. Saketh and Hrishi moved the design from SketchUp to Shapr3D and revised it after the first print failed. We can show the full loop and the phone readout today. The next test is repeatability with known volumes.

## 5:42–6:45 | Armaan · Slides 20–22

[Point to each proposed meter and then the gateway.]

For piped gas, an approved inline meter would measure cubic metres through the pipe. A dedicated ESP32 would read the meter’s approved output. We’d compare the app’s total with the register. A qualified installer handles the pipework, and a certified alarm handles gas leak detection.

For electricity, an electrician would install a certified circuit meter. Another ESP32 would read watts and kilowatt-hours from its isolated interface. At one hundred watts for ten hours, that’s one kilowatt-hour. We’d check that number against the meter and test a restart halfway through the day.

A local gateway would keep each reading’s source, time and unit. If a board goes offline, the app would show the gap. Gas and electricity are plans at this stage.

## 6:45–8:00 | Saketh · Slides 23–26

[Show the AI and smart-home plans. Close on Thank you. Keep Sources ready for questions.]

The next AI step is to show the evidence behind an answer. If use jumps overnight, show the hour, the amount and the usual range. Before a household pilot, we’d compare forecast errors and false alerts against a simple baseline.

For Google Home and Apple Home, we’d start with one Matter-over-Wi-Fi test device and a real enclosure switch. We’d pair it in Google Home, then add the same device in Apple Home. We’d open the case, restart the device and remove one connection to see if the other still updates. The detailed utility charts would stay in UTLT.ai. The pilot would be read-only, so the household decides what action to take.

What we want is simple. You open the app, see what changed, and know what to check.

UTLT.ai. The smarter way to save resources. Thank you.
