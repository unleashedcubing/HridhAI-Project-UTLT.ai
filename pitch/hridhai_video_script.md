# UTLT.ai — hridhAI 2026 pitch script

Junior category · AI for a Sustainable Future · Original SHOW/TELL cut sequence retained

**SHOW:** Fast montage: a dry tap → a Hyderabad water tanker → an apartment overhead tank → someone checking how much is left. On-screen text: “Hyderabad: water is too important to use blindly.” Small source line: “CGWB Telangana groundwater assessment, 2024.”

**TELL:** “In Hyderabad, water scarcity is part of ordinary life. But at home, we often find out how much we used only when the tank runs low or the bill arrives. We wanted to make water use visible early enough for a family to do something about it.”

**SHOW:** Team footage in the original cut: Hrishi’s Figma screens → ESP32 and converter wiring → pump and flow meter → Saketh and Hrishi checking the enclosure → teammates working on the app. Lower-third: “UTLT.ai · hridhAI 2026.”

**TELL:** “We are a student team building UTLT.ai for AI for a Sustainable Future. We designed the phone interface, assembled a working water loop, wrote the ESP32 code, and connected live readings to the app. Our goal is to help people choose where to save water. The app does not shut off anyone’s supply.”

**SHOW:** Hyderabad street footage and the same three-panel storyboard: “Scarcity → Uncertainty → Action.” Keep it personal and local; use your own footage where possible.

**TELL:** “The question that started this project was simple: if our family knows water is scarce, can we see when we are using it, compare it with our usual routine, and catch a tap that might have been left running?”

**SHOW:** Audience slide with the original four icon groups: families, apartment residents, shared flats, building associations. Replace the unsupported market-size placeholder with “First pilot: willing households in Hyderabad.” Use captions as *questions*, not invented interview quotes: “Where did today’s water go?” and “Is this amount unusual for us?”

**TELL:** “We are starting with households. Apartment residents and shared homes could benefit too, but a single meter cannot tell which person used which water. We are not claiming to split a bill between residents. First, we want to give a family a reliable total and a view of its own pattern.”

**SHOW:** Screen recording of the real dashboard, as in the original cut. Show the daily goal, litres used, by-time chart and a comparison with earlier measured days. Keep the “DEMO DATA” label visible if the screen uses samples.

**TELL:** “UTLT.ai turns sensor pulses into a daily water view. After six hours from the first recorded use, it gives an evening outlook against a goal the family sets for itself. A by-time chart comes from measured readings; it helps show when usage was high.”

**SHOW:** The original alert-card cut. Show the actual long-flow card, not a fabricated spike detector. Overlay: “16 minutes of continuous measured flow → check the tap.”

**TELL:** “If flow continues for 16 minutes, the app asks the household to check what is running. It is a useful warning, not a leak diagnosis: a shower, cleaning or a pump test can also keep water moving.”

**SHOW:** Keep the original breakdown cut, but show the app’s **by-use** pie chart and an uncertain-period review instead of a “Resident A/B/C” allocation screen. Highlight an AI suggestion and the resident’s correction.

**TELL:** “Our AI activity model uses timing, volume, duration and the household survey to suggest likely uses such as bathing or housework. We trained it on 1,000 *simulated* seven-day households. A flow meter cannot see which tap opened, so uncertain labels are checked with the resident. Measured litres stay separate from AI guesses.”

**SHOW:** Keep the original tight live-demo sequence: close-up of water passing through the meter → ESP32 → raw pulse count and app total rising in the **same continuous shot** → pump off and count steady → brief labeled sample-data comparison.

**TELL:** “Here is the end-to-end prototype. The flow meter sends pulses to the ESP32; Bluetooth sends the count to our phone web app. When we run the pump, the number rises. When we stop it, the number stops. The loop recirculates water, so this is simulated household use, not a home installation.”

**SHOW:** Keep the original five-box architecture diagram, with accurate labels: **Flow meter → ESP32/MicroPython → Bluetooth LE → Phone web app → AI suggestions and feedback**. Add a small separate callout: “On-phone Qwen assistant: experimental; phone test pending.”

**TELL:** “The water total is calculated from pulses, not invented by a language model. The phone interprets patterns, gives feedback, and can ask for a human correction. We are also testing a downloadable Qwen assistant for follow-up questions. It is separate from the measured water data.”

**SHOW:** Original impact montage, revised: a tap being checked → a family looking at its daily chart → a building tank → Hyderabad skyline. On-screen text: “See the pattern → check the cause → choose a change.”

**TELL:** “We have not yet measured water savings in real homes. What this prototype can do is make use visible while there is still time to act. Our first pilot will test whether families trust the numbers and find the feedback useful.”

**SHOW:** Original four-phase roadmap slide:

1. **Now:** working BLE water demo on the proven breadboard setup.
2. **Next:** verify the repaired breadboard under flow and calibrate across measured volumes and flow rates.
3. **Pilot:** test with consenting households and collect corrected activity labels.
4. **Later:** scale to buildings; add gas and electricity only through approved meter interfaces.

**TELL:** “The build taught us to challenge our own readings. Both ESP32s worked on one breadboard and neither on the second, so we traced the fault to that circuit and fixed it. Our new 3,000-pulses-per-litre setting is still a slow-flow demo estimate from a 160-millilitre test. We will recalibrate the repaired setup before calling this a household meter. That is how UTLT.ai moves from a hackathon prototype toward a tool people can trust.”

## Recording checks

- Keep the original cuts and quick pacing, but let the live meter shot run long enough for judges to see the count change without an edit.
- Use the proven breadboard setup with either ESP32. Check the red sensor power wire, shared ground and converter rails before filming.
- Do not show resident-by-resident cost splitting, an apartment manager dashboard, or a backend/API as working water-demo features.
- Keep simulated readings visibly labeled. Show Qwen on an iPhone only after the exact phone successfully downloads and runs it.
- The 3,000 pulses/L conversion is provisional: 10–14 pulses/s over the earlier 38–41 s/160 mL fill implies about 2,375–3,588 pulses/L. These observations were not paired trials.

## Sources

- [hridhAI judging criteria](https://hridhai.in/assets/hridhAI_Judging_Criteria.pdf): AI and technical soundness 30%; problem, impact and innovation 25%; prototype 25%; solved challenges 10%; presentation and Q&A 10%.
- [Central Ground Water Board, Telangana 2024 assessment](https://www.cgwb.gov.in/cgwbpnm/public/uploads/documents/1743586655783642514file.pdf): source for the Hyderabad district groundwater statement.
- [UTLT.ai project report](../reports/UTLT_Project_Report_16_Nov_2026.pdf): build record and limitations.
