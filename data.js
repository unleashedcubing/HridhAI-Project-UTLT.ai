/* Data contract for the standalone app. A meter supplies litres and timestamps;
   activity categories require labeled readings. */
(function () {
  "use strict";

  const categories = [
    { label: "Food/Drink", color: "#0a6fb3", emoji: "🍽️" },
    { label: "Bath", color: "#19b5e8", emoji: "🚿" },
    { label: "Housework", color: "#7c5cfc", emoji: "🧺" },
    { label: "Misc", color: "#12c2a5", emoji: "🔧" }
  ];
  const times = [
    { label: "Morning", color: "#f6b73c", emoji: "🌅" },
    { label: "Afternoon", color: "#19b5e8", emoji: "☀️" },
    { label: "Evening", color: "#7c5cfc", emoji: "🌆" },
    { label: "Night", color: "#0a4f8f", emoji: "🌙" }
  ];

  /* Water-saving tips shown on the dashboard, matched to the category used most today.
     Each category has several tips; one is picked per day so the card stays fresh.
     Plain content only: edit or add wording freely. */
  const tips = {
    "Food/Drink": { emoji: "🚰", texts: [
      "Collect RO reject water and reuse it for mopping or watering plants. Wash vegetables in a bowl instead of under a running tap.",
      "Keep a jug of drinking water in the fridge instead of running the tap until it turns cold.",
      "After washing vegetables and fruit in a bowl, pour that water on your plants."
    ] },
    "Bath": { emoji: "🚿", texts: [
      "A bucket bath or a shorter shower, and turning the water off while you soap, can save many litres every single day.",
      "Keep a bucket under the shower to catch the first cold water, then use it for flushing or mopping.",
      "A leaking shower head or bathroom tap can waste many litres without you noticing. Fix it early."
    ] },
    "Housework": { emoji: "🧺", texts: [
      "Run the washing machine only with full loads, and reuse the last rinse water for mopping floors or cleaning the balcony.",
      "Mop with a bucket instead of a running hose, and reuse water from rinsing rice or vegetables.",
      "Soak dirty plates in a basin first instead of rinsing each one under a running tap."
    ] },
    "Misc": { emoji: "🔧", texts: [
      "Check taps, flush tanks and pipes for leaks. A slow drip can quietly waste many litres every day.",
      "Close the tap while brushing your teeth or washing your face. It adds up to many litres over a month.",
      "Leak check: note your meter, don’t use any water for an hour, then look again. If it moved, you may have a leak."
    ] },
    "default": { emoji: "💧", texts: [
      "Small habits add up. Fix leaks quickly and turn taps off while you are not using the water."
    ] }
  };

  const amounts = [
    [55, 140, 75, 30],
    [48, 120, 65, 27],
    [62, 150, 82, 36],
    [67, 157, 90, 36],
    [49, 128, 67, 26],
    [54, 139, 76, 25]
  ];
  const splits = [
    [0.3, 0.35, 0.3, 0.05],
    [0.55, 0.1, 0.3, 0.05],
    [0.15, 0.45, 0.3, 0.1],
    [0.25, 0.25, 0.3, 0.2]
  ];
  const hours = [8, 13, 19, 23];
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const [year, month, date] = today.split("-").map(Number);
  const demoReadings = amounts.flatMap((dayAmounts, dayIndex) => {
    const day = new Date(Date.UTC(year, month - 1, date - (amounts.length - 1 - dayIndex), 12))
      .toISOString().slice(0, 10);
    return dayAmounts.flatMap((amount, categoryIndex) => hours.map((hour, hourIndex) => ({
      recordedAt: `${day}T${String(hour).padStart(2, "0")}:${String(categoryIndex * 5).padStart(2, "0")}:00+05:30`,
      litres: amount * splits[categoryIndex][hourIndex],
      category: categories[categoryIndex].label
    })));
  });

  function timeIndex(timestamp) {
    const hour = Number(timestamp.slice(11, 13));
    if (hour >= 5 && hour < 12) return 0;
    if (hour >= 12 && hour < 17) return 1;
    if (hour >= 17 && hour < 21) return 2;
    return 3;
  }

  function summarize(readings) {
    const valid = readings.filter((reading) =>
      typeof reading.recordedAt === "string" &&
      !Number.isNaN(Date.parse(reading.recordedAt)) &&
      Number.isFinite(reading.litres) && reading.litres >= 0
    );
    const dates = [...new Set(valid.map((reading) => reading.recordedAt.slice(0, 10)))].sort().slice(-6);
    const currentDay = dates[dates.length - 1];
    const daily = dates.map((day) => ({
      date: day,
      litres: valid.filter((reading) => reading.recordedAt.startsWith(day))
        .reduce((sum, reading) => sum + reading.litres, 0)
    }));
    const byUse = categories.map((category) => ({ ...category, litres: 0 }));
    const byTime = times.map((time) => ({ ...time, litres: 0 }));

    for (const reading of valid) {
      if (!reading.recordedAt.startsWith(currentDay)) continue;
      (byUse.find((item) => item.label === reading.category) || byUse[3]).litres += reading.litres;
      byTime[timeIndex(reading.recordedAt)].litres += reading.litres;
    }
    return { used: daily.at(-1)?.litres ?? 0, daily, byUse, byTime };
  }

  window.UTLTData = Object.freeze({ categories, times, tips, demoReadings, summarize });
})();
