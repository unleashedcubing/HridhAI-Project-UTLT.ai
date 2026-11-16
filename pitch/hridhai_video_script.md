# UTLT.ai — hridhAI 2026 video pitch

Junior category · AI for a Sustainable Future · About 2½ minutes

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:20 | A tap, an apartment water tank, then a real Hyderabad street shot. On-screen source: “CGWB Telangana groundwater assessment, 2024: Hyderabad district over-exploited.” | “In Hyderabad, we talk about saving water. But at home, it is hard to save what we cannot see. A bill arrives later; a tank running low tells us even less about what happened during the day.” |
| 0:20–0:38 | Hrishi’s Figma screens beside the finished dark and light app. Show the team working at the table, with names and roles, not a generic stock montage. | “We built UTLT.ai for the hridhAI challenge, AI for a Sustainable Future. Our idea is a water monitor that helps a family understand its routine and choose where to save. It warns; it does not shut off anyone’s water.” |
| 0:38–1:08 | One continuous shot: reservoir → pump → flow meter → ESP32. Start the pump. Keep the phone in frame as raw pulses and litres rise. Stop the pump and show the count settle. | “Here is the working prototype. Water moves through a flow sensor. An ESP32 counts its pulses and sends the reading by Bluetooth to our phone web app. When the pump starts, the count rises. When it stops, the count stops. The loop recirculates water, so each pass simulates household use.” |
| 1:08–1:35 | Screen recording: daily litres and goal; switch “A glance at your day” between by-time and by-use. Show the long-flow card and six-hour forecast only with real or clearly marked demo data. | “The app shows how much water has passed through the sensor and when. Six hours after the first use, it estimates whether we might reach our own daily target by evening. Sixteen minutes of continuous flow prompts us to check for a tap left running. It cannot diagnose a leak by itself.” |
| 1:35–2:00 | Show the household survey, one uncertain activity suggestion, and the resident choosing the correct label. Brief overlay: “1,000 simulated seven-day households · activity suggestions, not measured facts.” | “This is where our AI helps. We trained an activity model on 1,000 simulated seven-day households. It uses volume, timing and the family’s routine to suggest what the water may have been used for. One meter cannot know which tap was opened, so we ask the resident when we are unsure. The family stays in control of the label.” |
| 2:00–2:20 | Show the timed 160 mL fill, raw pulse display, and a simple card: “4,075 pulses/L: working demo estimate.” Cut to the 3D enclosure and magnet seats. | “Accuracy was our hardest problem. Our pump ran below the sensor’s rated flow, and an early reading looked wrong. We timed a 160-millilitre fill, checked the pulses, and kept our conversion clearly marked as an estimate. We designed a case to separate water and electronics.” |
| 2:20–2:38 | Team together with the live setup. End card: “Measure → understand → choose.” Small text: “Next: calibrated household pilot; approved gas and electricity meter interfaces.” | “Next we will calibrate across different flow rates and test in real homes with permission. Gas and electricity could later join through approved meters, but today we are proving the water system. UTLT.ai makes sustainability something a household can see—and act on.” |

## Before recording

- Use the working **2C2C** board for the live shot unless A014 has been retested with flowing water. Show the raw pulse count and litres in the same take.
- If a screen uses sample readings, keep its **DEMO DATA** label visible. Do not show a per-resident split, cost allocation, or apartment manager dashboard as a working feature.
- The Qwen3 question assistant is still awaiting a complete phone-browser test. Show it only after the exact demo phone successfully downloads and runs the model; otherwise keep the film focused on the tested activity model.
- Put the CGWB source in the closing credits or video description. Ask team members to approve their on-screen names and roles.

## Source checks

- [hridhAI judging criteria](https://hridhai.in/assets/hridhAI_Judging_Criteria.pdf): AI and technical soundness 30%; problem, impact and innovation 25%; working prototype 25%; solved challenges 10%; presentation and Q&A 10%.
- [Central Ground Water Board, Telangana 2024 assessment](https://www.cgwb.gov.in/cgwbpnm/public/uploads/documents/1743586655783642514file.pdf): source for the Hyderabad district groundwater statement.
- [UTLT.ai project report](../reports/UTLT_Project_Report_16_Nov_2026.pdf): the build record and current limitations.
