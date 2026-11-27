# UTLT.ai | Eight-minute team speech

Read the paragraphs aloud. Brackets are silent cues for whoever is driving the slides. The times are rehearsal targets. Slide 27 has sources and AI credits for questions.

## 0:00–0:55 | Saketh · Slides 1–6

[Start on the cover. Move through the agenda and team. Pause on Research.]

Has anyone at home ever asked, “Did we leave a tap running?” A water bill comes too late to help you check.

We chose water because of the water crisis. Reading Telangana’s groundwater assessment made the problem feel close to home. So we picked one thing we could build and test. Could we show a family how much water they were using while they still had time to do something about it?

We’re Saketh, Armaan, Vibhav, Abhinav and Hrishi. Our project is UTLT.ai. We built a water monitor that sends readings to a phone. Abhinav will show what the family sees.

## 0:55–1:40 | Abhinav · Slides 7–8

[Point to the daily total and the goal. Then show the chart.]

The app shows today’s litres and how close you are to your goal. The chart shows when you used the water, so you can spot an unusual jump.

Hrishi drew the light and dark screens in Figma. Armaan worked on navigation and accounts, and I worked on the charts and smaller screens. We also made guesses clearer. The meter measures water passing through it. If we can’t tell what you used it for, we leave the activity unconfirmed. Vibhav will show how we get the readings.

## 1:40–2:30 | Vibhav · Slides 9–10

[Trace the loop with your finger. Then point to the sensor and the ESP32 board.]

We use one reservoir. The pump draws water out, sends it through the sensor, and returns it to the same container. We can run the demo again and again with the same water. The app counts each pass through the sensor.

The sensor sends pulses as water moves. A small converter makes the signal safe for our ESP32 board to read. The board counts the pulses and sends the count over Bluetooth. The phone converts it to litres. Our starting conversion comes from a 160-millilitre bench test, using 40 seconds as the app’s reference. We’ll check it again at several flow rates.

## 2:30–3:42 | Hrishi · Slides 11–12

[Show model training, then Niro’s first week.]

We wanted the app to help explain the readings. We trained an activity model using simulated routines from eight hundred homes and tested it on two hundred other simulated homes. That gave us a starting point. We still need to check it against real household routines.

Niro is the assistant in the app. It runs on the phone after a model download. First, it asks about things like household size, showers and laundry. It suggests a daily goal you can change.

During the first week, it might highlight an hour and ask, “What did you use this water for?” You can say “showering and cooking,” and Niro keeps both labels together. You can also say “I don’t remember.” After that first week, Niro can estimate a typical day once it has at least three recorded days.

## 3:42–5:07 | Abhinav · Slides 13–16

[Show the app overview. Say the demos use sample data.]

Let’s try three situations. First, a possible leak. At fifteen minutes of continuous flow, the app is still watching. Advance one minute and it asks you to check. The total rises from 160 to 163 litres.

[Click Simulate flow stopping.]

The alert clears and the total stays. A running tap could be intentional, so we’d test how often normal use triggers this warning.

[On Water trends, click Explain the trend.]

Second, look at the week. The first three days averaged 262 litres. The last three averaged 344. That tells us the final day was part of a rise.

[On AI water coach, click What can I do now?]

Third, the coach. It’s four in the afternoon and the sample home has used 240 litres in six hours. At that pace, it could reach 400 litres by eight. That’s 50 above the goal. Niro can explain the forecast and suggest a simple action, like turning the tap off while scrubbing.

## 5:07–5:47 | Vibhav · Slides 17–19

[Show the two boards and the case photos.]

One board connected to the phone but showed zero flow. We swapped the boards between the breadboards. Both worked on one setup and neither worked on the other. That told us where to look for the wiring fault.

The first case print also failed. Saketh and Hrishi moved the design from SketchUp to Shapr3D and revised the enclosure. We’ve demonstrated the Bluetooth reading on the water loop. A repeatable calibration is the next thing we want to prove.

## 5:47–6:49 | Armaan · Slides 20–22

[Point to the gas pipe, electrical meter, and gateway.]

Gas and electricity are our next plans. For gas, an approved meter on the pipe would measure the volume moving through it. An ESP32 would read the meter’s output, and we’d check our total against the meter display. A qualified installer handles the pipework, and a certified alarm handles gas leaks.

For electricity, an electrician would install an approved meter. Another ESP32 would read its data output. The app could show how much power the home uses right now and how much energy it used over the day.

Eventually a local gateway would collect the three meters’ readings. If a meter stopped sending data, the app would show a gap.

## 6:49–8:00 | Saketh · Slides 23–26

[Show the AI plan, then Google Home and Apple Home. Finish on Thank you.]

As we improve Niro, we want it to show the reading behind every claim. If water use jumps overnight, show the hour and the amount. Before a household pilot, we’ll check how often alerts get it wrong and how close forecasts come to the actual totals.

For Google Home and Apple Home, we’d start with one Matter test device and a switch that tells us whether the enclosure is open. Add the same device to both apps, then restart it to see if both still get updates. The detailed charts would stay in UTLT.ai. The household decides what to do when it receives an alert.

We started with one question about a running tap. Now we can show a family how much water moved and when to take a closer look.

UTLT.ai. The smarter way to save resources. Thank you.
