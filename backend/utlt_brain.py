"""
utlt_brain.py - the "mind" of the UTLT.ai assistant (pure Python, no dependencies).

Reads the SAME data shape as the UTLT.ai web app:
    {"recordedAt": "2026-11-05T08:00:00+05:30", "litres": 12.5, "category": "Bath"}
    category: Food/Drink | Bath | Housework | Misc     (default goal: 350 L/day, Asia/Kolkata dates)

What it knows how to do
  * Status      - today vs goal, projection, tomorrow, week trend, top use, LPG, alerts, streak
  * Prediction  - end-of-day projection (pace-adjusted), P(exceeding goal), 7-day forecast,
                  with a backtested accuracy score so the numbers are honest
  * Patterns    - peak window, weekday vs weekend, per-category habits, week-on-week change
  * Anomalies   - spike days (robust z-score), overnight-flow leak detection, LPG leak detection
  * Advice      - tips computed from YOUR data
"""
import difflib
import json
import math
import random
import re
import statistics
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

# ------------------------------------------------------------------ config
IST = timezone(timedelta(hours=5, minutes=30))       # Asia/Kolkata (no DST)
DAILY_GOAL_L = 350                                   # same default as the app
CATS = ["Food/Drink", "Bath", "Housework", "Misc"]
NIGHT_HOURS = (1, 5)                                 # 1 AM - 5 AM: nobody should be using water
TARE_KG, GAS_FULL_KG, LOW_GAS_PCT = 15.3, 14.2, 20   # LPG cylinder
EMERGENCY_NUMBER = "1906"                            # India LPG emergency line - change for your region
DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


@dataclass
class Reading:
    t: datetime
    litres: float
    category: str = "Misc"


def fh(h):
    """24h -> '7 AM'."""
    return f"{(h % 12) or 12} {'AM' if h % 24 < 12 else 'PM'}"


# ------------------------------------------------------------------ data in
def parse_readings(raw):
    """Accepts a list of readings, or {'readings': [...]} (e.g. from UTLT.getState())."""
    if isinstance(raw, dict):
        raw = raw.get("readings", [])
    out = []
    for r in raw or []:
        try:
            t = datetime.fromisoformat(str(r["recordedAt"]).replace("Z", "+00:00"))
            if t.tzinfo is None:
                t = t.replace(tzinfo=IST)
            litres = float(r["litres"])
            if litres < 0 or math.isnan(litres):
                continue
            cat = r.get("category") or "Misc"
            out.append(Reading(t.astimezone(IST), litres, cat if cat in CATS else "Misc"))
        except Exception:
            continue
    return sorted(out, key=lambda x: x.t)


def load_file(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return parse_readings(json.load(f))
    except Exception:
        return []


SLOTS = [  # (from_hour, to_hour, category, litres range, probability)
    (6, 8, "Bath", (40, 65), 1.0), (7, 9, "Bath", (30, 55), 0.8), (7, 9, "Food/Drink", (8, 15), 1.0),
    (12, 14, "Food/Drink", (10, 20), 1.0), (19, 21, "Food/Drink", (12, 25), 1.0),
    (9, 11, "Housework", (40, 80), 0.7), (17, 19, "Housework", (25, 50), 0.6),
    (15, 17, "Misc", (10, 30), 0.6), (21, 23, "Bath", (15, 35), 0.5),
]


def make_demo(now, days=28, seed=7, night_leak=False):
    """Realistic household water data: weekday/weekend rhythm, one spike day, optional night leak."""
    rng, out = random.Random(seed), []
    for back in range(days, -1, -1):
        d = now.date() - timedelta(days=back)
        weekend = d.weekday() >= 5
        factor = rng.uniform(0.9, 1.1) * (1.25 if weekend else 1.0)
        for lo, hi, cat, (a, b), p in SLOTS:
            if rng.random() > min(1.0, p * (1.2 if weekend else 1.0)):
                continue
            t = datetime(d.year, d.month, d.day, rng.randint(lo, hi - 1), rng.randint(0, 59), tzinfo=IST)
            if t <= now:
                out.append(Reading(t, round(rng.uniform(a, b) * factor, 1), cat))
        if back == 9:  # a hose left running one afternoon
            out.append(Reading(datetime(d.year, d.month, d.day, 16, 10, tzinfo=IST), 220.0, "Misc"))
        if night_leak and back <= 3:  # dripping tap / running cistern at night
            for h in range(*NIGHT_HOURS):
                t = datetime(d.year, d.month, d.day, h, rng.randint(0, 59), tzinfo=IST)
                if t <= now:
                    out.append(Reading(t, round(rng.uniform(4, 6), 1), "Misc"))
    return sorted(out, key=lambda r: r.t)


# ------------------------------------------------------------------ water model
def _slope(vals):
    n = len(vals)
    if n < 3:
        return 0.0
    mx, my = (n - 1) / 2, sum(vals) / n
    den = sum((i - mx) ** 2 for i in range(n))
    return sum((i - mx) * (v - my) for i, v in enumerate(vals)) / den


def _phi(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


class WaterModel:
    def __init__(self, readings, now, goal=DAILY_GOAL_L):
        self.now, self.goal, self.today = now, goal, now.date()
        self.readings = [r for r in readings if r.t <= now]
        self.by_day = defaultdict(float)
        self.by_cat = defaultdict(lambda: defaultdict(float))
        self.hourly = defaultdict(lambda: [0.0] * 24)
        for r in self.readings:
            d = r.t.date()
            self.by_day[d] += r.litres
            self.by_cat[d][r.category] += r.litres
            self.hourly[d][r.t.hour] += r.litres
        self.so_far = self.by_day.get(self.today, 0.0)
        self.days = [(d, self.by_day[d]) for d in sorted(self.by_day) if d < self.today]
        self.ready = len(self.days) >= 5

        # share of a typical day's water used by each hour -> "how far through the day are we?"
        valid = [d for d, v in self.days if v > 0]
        self.shares = [1 / 24] * 24
        if valid:
            self.shares = [sum(self.hourly[d][h] / self.by_day[d] for d in valid) / len(valid) for h in range(24)]
        self.frac = min(1.0, sum(self.shares[:now.hour]) + self.shares[now.hour] * now.minute / 60)

        self._backtest()
        self.forecast_today = self._forecast(self.today, self.days)
        self.proj = self._projection()
        self.p_exceed = self._p_exceed()
        self.night = self._night_flow()
        self.spikes, self.median, self.mad = self._spikes()

    # --- forecasting
    def _forecast(self, target, days):
        if len(days) < 3:
            return None
        vals = [v for _, v in days[-14:]]
        ewma = vals[0]
        for v in vals[1:]:
            ewma = 0.35 * v + 0.65 * ewma
        same = [v for d, v in days[-28:] if d.weekday() == target.weekday()][-4:]
        level = 0.5 * ewma + 0.5 * statistics.mean(same) if len(same) >= 2 else ewma
        return max(0.0, level + 0.5 * _slope(vals))

    def _backtest(self):
        errs, apes = [], []
        for i in range(max(5, len(self.days) - 7), len(self.days)):
            p = self._forecast(self.days[i][0], self.days[:i])
            if p is not None:
                a = self.days[i][1]
                errs.append(a - p)
                apes.append(abs(a - p) / max(a, 1))
        self.mae = statistics.mean(abs(e) for e in errs) if errs else None
        self.accuracy = max(0.0, 100 * (1 - statistics.mean(apes))) if apes else None
        avg = statistics.mean(v for _, v in self.days) if self.days else 300
        self.sigma = max(15.0, statistics.pstdev(errs)) if len(errs) >= 3 else 0.12 * avg

    def _projection(self):
        base = self.forecast_today
        if base is None:
            return None
        pace = 1.0
        if self.frac > 0.25 and base > 0:  # blend what we expected with how today is actually going
            pace = min(1.4, max(0.7, self.so_far / (self.frac * base)))
        return self.so_far + max(0.0, 1 - self.frac) * base * pace

    def _p_exceed(self):
        if self.proj is None:
            return None
        if self.so_far >= self.goal:
            return 1.0
        s = self.sigma * math.sqrt(max(0.05, 1 - self.frac))
        return 1 - _phi((self.goal - self.proj) / s)

    def next_days(self, n=7):
        """Forecast the coming days, feeding each prediction back in."""
        days = list(self.days)
        if self.proj is not None:
            days.append((self.today, self.proj))
        out, d = [], self.today
        for _ in range(n):
            d += timedelta(days=1)
            p = self._forecast(d, days)
            if p is None:
                break
            out.append((d, p))
            days.append((d, p))
        return out

    # --- patterns
    def week_trend(self):
        v = [x for _, x in self.days]
        if len(v) < 10:
            return None
        last, prev = statistics.mean(v[-7:]), statistics.mean(v[-14:-7]) if len(v) >= 14 else statistics.mean(v[:-7])
        return last, prev, (last - prev) / prev * 100 if prev else 0.0

    def category_share(self, n=7):
        tot = defaultdict(float)
        for d, _ in self.days[-n:]:
            for c, v in self.by_cat[d].items():
                tot[c] += v
        s = sum(tot.values())
        return sorted(((c, v, v / s * 100) for c, v in tot.items()), key=lambda x: -x[1]) if s else []

    def peak_window(self):
        if not self.days:
            return None
        avg = [statistics.mean(self.hourly[d][h] for d, _ in self.days) for h in range(24)]
        h = max(range(24), key=lambda i: avg[i] + avg[(i + 1) % 24])
        return h, (h + 2) % 24, (avg[h] + avg[(h + 1) % 24]) / sum(avg) * 100

    def weekday_profile(self):
        buckets = defaultdict(list)
        for d, v in self.days[-28:]:
            buckets[d.weekday()].append(v)
        return {k: statistics.mean(v) for k, v in buckets.items()}

    def category_peak(self, cat):
        by_h = [0.0] * 24
        for r in self.readings:
            if r.category == cat and r.t.date() < self.today:
                by_h[r.t.hour] += r.litres
        return max(range(24), key=lambda h: by_h[h]) if sum(by_h) else None

    def avg_per_use(self, cat="Bath"):
        v = [r.litres for r in self.readings if r.category == cat and (self.today - r.t.date()).days <= 14]
        return statistics.mean(v) if v else None

    # --- anomalies
    def _spikes(self):
        """Robust z-score vs the same kind of day (weekday vs weekend), so a busy Sunday isn't a 'spike'."""
        window = self.days[-28:]
        if len(window) < 7:
            return [], None, None
        stats = {}
        for wk in (False, True):
            vals = [v for d, v in window if (d.weekday() >= 5) == wk]
            if len(vals) >= 4:
                med = statistics.median(vals)
                stats[wk] = (med, max(15.0, statistics.median(abs(v - med) for v in vals) * 1.4826))
        allv = [v for _, v in window]
        fallback = (statistics.median(allv), max(15.0, statistics.median(abs(v - statistics.median(allv)) for v in allv) * 1.4826))
        out = []
        for d, v in window:
            med, mad = stats.get(d.weekday() >= 5, fallback)
            if (v - med) / mad > 2.5:
                out.append((d, v, (v - med) / mad, med))
        return out, fallback[0], fallback[1]

    def _night_flow(self):
        def night(d):
            return sum(self.hourly[d][NIGHT_HOURS[0]:NIGHT_HOURS[1]]) if d in self.by_day else 0.0
        hist = [d for d, _ in self.days]
        base = statistics.median(night(d) for d in hist[:-3]) if len(hist) > 6 else 0.0
        thr = max(3.0, 3 * base)
        recent = hist[-2:] + ([self.today] if self.now.hour >= 2 else [])
        flagged = [night(d) for d in recent if night(d) > thr]
        leak = len(flagged) >= 2
        waste = statistics.mean(flagged) * 24 / (NIGHT_HOURS[1] - NIGHT_HOURS[0]) if leak else 0.0
        return {"leak": leak, "nights": len(flagged), "avg": statistics.mean(flagged) if flagged else 0.0,
                "waste_per_day": waste}

    # --- goal stats
    def streak(self):
        n = 0
        for _, v in reversed(self.days):
            if v <= self.goal:
                n += 1
            else:
                break
        return n

    def saved_week(self):
        last = self.days[-7:]
        return sum(max(0.0, self.goal - v) for _, v in last), sum(1 for _, v in last if v > self.goal)


# ------------------------------------------------------------------ LPG cylinder (hardware)
class Lpg:
    def __init__(self):
        self.t, self.gas, self.burner, self.leak = 0.0, GAS_FULL_KG * 0.62, False, False
        self.hist = deque(maxlen=90)
        for _ in range(60):
            self.tick()

    def tick(self):
        self.t += 1 / 6
        if random.random() < 0.10:
            self.burner = not self.burner
        use = random.uniform(0.25, 0.45) / 6 if self.burner else 0
        if self.leak:
            use += 0.04
        self.gas = max(0.0, self.gas - use + random.uniform(-0.003, 0.003))
        self.hist.append((self.t, self.gas, self.burner))

    @property
    def pct(self):
        return max(0.0, min(100.0, self.gas / GAS_FULL_KG * 100))

    def burn_rate(self):
        """kg/hour averaged over the whole window (drop / elapsed time)."""
        if len(self.hist) < 30:
            return None
        (t0, g0, _), (t1, g1, _) = self.hist[0], self.hist[-1]
        return max(0.0, (g0 - g1) / (t1 - t0)) if t1 > t0 else None

    def days_left(self):
        r = self.burn_rate()
        return None if not r or r < 1e-4 else self.gas / r / 24

    def leak_suspected(self):
        h = list(self.hist)[-4:]
        if len(h) < 4:
            return False
        return all(not x[2] for x in h) and all(h[i][1] - h[i + 1][1] > 0.02 for i in range(3))


# ------------------------------------------------------------------ assistant
INTENTS = {
    "status": ["status", "summary", "overview", "report", "update", "everything", "all data", "how am i doing",
               "how is it going", "brief", "dashboard"],
    "today": ["today", "so far", "used today", "usage", "how much water", "water used", "consumption", "litres"],
    "forecast": ["predict", "prediction", "forecast", "tomorrow", "next week", "will i", "projected",
                 "end of day", "trend", "expect", "going to use"],
    "pattern": ["pattern", "patterns", "habit", "habits", "routine", "peak", "when do i use", "weekday",
                "weekend", "insight", "insights", "smart"],
    "anomaly": ["leak", "anomaly", "unusual", "spike", "abnormal", "waste", "smell", "safe", "safety", "danger"],
    "goal": ["goal", "budget", "limit", "target", "left", "remaining", "streak", "saved", "saving"],
    "category": ["category", "breakdown", "where is my water going", "bath", "shower", "food", "housework", "misc"],
    "compare": ["compare", "last week", "versus", "change", "better", "worse", "difference"],
    "lpg": ["lpg", "gas", "gas level", "gas left", "how much gas", "cylinder", "burner", "refill", "book"],
    "tips": ["tip", "tips", "save", "efficient", "reduce", "advice", "recommend"],
    "how": ["how does", "work", "explain", "esp32", "project", "utlt", "about", "model", "accuracy"],
    "help": ["help", "what can you do", "commands", "options"],
    "hello": ["hi", "hello", "hey", "yo", "good morning", "good evening"],
    "thanks": ["thanks", "thank you", "thx", "ty", "appreciate it", "cool", "great", "nice", "awesome", "lit"],
    "yes": ["yes", "yeah", "yep", "yup", "yea", "bet", "sure", "ok", "okay", "k", "alright", "fr", "for sure",
            "go ahead", "do it", "sounds good", "please", "pls", "lets go", "let's go"],
    "no": ["no", "nope", "nah", "not now", "no thanks", "skip", "pass"],
    "bye": ["bye", "goodbye", "see you", "cya", "gtg", "good night"],
}


class Assistant:
    def __init__(self, readings=None, goal=DAILY_GOAL_L, demo_night_leak=False):
        self.goal, self.source = goal, "file" if readings else "demo"
        self.lpg, self.fired, self.pending = Lpg(), set(), None
        self.readings = readings or make_demo(datetime.now(IST), night_leak=demo_night_leak)
        self.night_leak = demo_night_leak
        self.refresh()

    # --- time & model
    @property
    def now(self):
        real = datetime.now(IST)
        return min(real, self.readings[-1].t) if self.source == "file" and self.readings else real

    def refresh(self):
        self.w = WaterModel(self.readings, self.now, self.goal)
        return self.w

    def tick(self):
        """Called every second or two by the UI."""
        self.lpg.tick()
        if self.source == "demo":
            now = self.now
            if 6 <= now.hour <= 22 and random.random() < 0.01:
                cat = random.choice(["Food/Drink", "Food/Drink", "Bath", "Housework", "Misc"])
                self.readings.append(Reading(now, round(random.uniform(3, 12), 1), cat))
            if self.night_leak and 1 <= now.hour < 5 and random.random() < 0.05:
                self.readings.append(Reading(now, round(random.uniform(1, 2), 1), "Misc"))
        self.refresh()

    # --- alerts (each fires once while its condition holds)
    def alerts(self):
        w, c = self.w, {}
        if w.ready and w.proj and w.so_far >= 0.25 * self.goal and w.p_exceed >= 0.7 and w.proj > self.goal:
            c["goal"] = ("warn", f"⚠️ **Goal at risk:** you're on pace for **{w.proj:.0f} L** today against your "
                                 f"{self.goal} L goal ({w.p_exceed * 100:.0f}% chance of going over). "
                                 "Ask me for tips to get back on track.")
        if w.night["leak"]:
            c["night"] = ("leak", f"🚨 **Possible water leak:** steady flow overnight ({w.night['nights']} nights in a "
                                  f"row, ~{w.night['avg']:.0f} L between {fh(NIGHT_HOURS[0])}-{fh(NIGHT_HOURS[1])}). "
                                  f"That could be up to **{w.night['waste_per_day']:.0f} L/day** wasted. "
                                  "Check taps, flush tanks and the overhead tank float valve.")
        if self.lpg.leak_suspected():
            c["lpg_leak"] = ("leak", self._lpg_leak_text())
        if self.lpg.pct <= LOW_GAS_PCT:
            c["lpg_low"] = ("warn", f"⚠️ LPG is down to **{self.lpg.pct:.0f}%** - time to book a refill.")
        new = [(k, *v) for k, v in c.items() if k not in self.fired]
        self.fired = set(c)
        return new

    def _lpg_leak_text(self):
        return ("🚨 **LPG LEAK SUSPECTED** - cylinder weight is dropping while the burner is off.\n\n"
                "1. No switches or flames\n2. Open doors and windows\n3. Close the regulator\n"
                f"4. Leave and call **{EMERGENCY_NUMBER}**")

    # --- intent engine (typo tolerant)
    def intent(self, text):
        raw = text.lower()
        variants = {raw, re.sub(r"(.)\1+", r"\1", raw)}  # "noooo" / "yesss" -> "no" / "yes"
        best, best_score = None, 0.0
        for text in variants:
            words = re.findall(r"[a-z']+", text)
            for name, keys in INTENTS.items():
                score = 0.0
                for k in keys:
                    if re.search(r"\b" + re.escape(k) + r"(s|es)?\b", text):
                        score += 2 * len(k.split())
                    else:
                        score += 1.5 * sum(1 for w in words if len(w) > 3
                                     and difflib.get_close_matches(w, k.split(), n=1, cutoff=0.8))
                if score > best_score:
                    best, best_score = name, score
        return best if best_score >= 1.5 or best == "hello" else None

    # ============================================================ answers
    def _need_data(self):
        return "I need at least 5 days of readings before I can predict reliably. I'm still learning your routine."

    def status(self):
        w, goal = self.w, self.goal
        asof = w.now.strftime("%a %d %b, %I:%M %p").replace(" 0", " ")
        L = [f"**📊 UTLT.ai status** · {asof}" + (" *(latest reading)*" if self.source == "file" else "")]
        pct = w.so_far / goal * 100
        L.append(f"- 💧 **Water today:** {w.so_far:.0f} L of {goal} L goal (**{pct:.0f}%**)")
        if w.ready and w.proj is not None:
            verdict = ("on track ✅" if w.proj <= 0.9 * goal else
                       "close to your limit ⚠️" if w.proj <= goal else "likely to exceed ❌")
            L.append(f"- 📈 **Projected by midnight:** ~{w.proj:.0f} L - {verdict} "
                     f"({w.p_exceed * 100:.0f}% chance of exceeding)")
            nxt = w.next_days(1)
            tr = w.week_trend()
            if nxt:
                d, p = nxt[0]
                L.append(f"- 🗓 **Tomorrow ({DOW[d.weekday()]}):** ~{p:.0f} L" +
                         (f" · 7-day avg {tr[0]:.0f} L ({tr[2]:+.0f}% vs previous week)" if tr else ""))
            top, pk = w.category_share(), w.peak_window()
            if top:
                L.append(f"- 🔝 **Top use:** {top[0][0]} ({top[0][2]:.0f}%)" +
                         (f" · **Peak window:** {fh(pk[0])}-{fh(pk[1])}" if pk else ""))
            sv, over = w.saved_week()
            L.append(f"- 🏅 **Streak:** {w.streak()} day(s) under goal · saved {sv:.0f} L this week"
                     + (f" · {over} day(s) over" if over else ""))
        else:
            L.append("- 🧠 Still learning your routine (need 5+ days of data for predictions).")
        warn = []
        if w.night["leak"]:
            warn.append(f"overnight water flow (~{w.night['avg']:.0f} L/night)")
        if w.spikes and (w.today - w.spikes[-1][0]).days <= 3:
            warn.append(f"spike on {DOW[w.spikes[-1][0].weekday()]} ({w.spikes[-1][1]:.0f} L)")
        if self.lpg.leak_suspected():
            warn.append("LPG leak signature")
        L.append(f"- 🔥 **LPG:** {self.lpg.pct:.0f}% ({self.lpg.gas:.1f} kg)" +
                 (f" · ~{self.lpg.days_left():.1f} days left" if self.lpg.days_left() else ""))
        L.append("- 🚨 **Alerts:** " + ("; ".join(warn) if warn else "none - all clear ✅"))
        return "\n".join(L)

    def a_today(self):
        w, goal = self.w, self.goal
        left = goal - w.so_far
        s = f"So far today: **{w.so_far:.0f} L** ({w.so_far / goal * 100:.0f}% of your {goal} L goal). "
        if left > 0:
            s += f"You have **{left:.0f} L** left"
            b = w.avg_per_use("Bath")
            s += f" - roughly {left / b:.1f} more showers at your usual {b:.0f} L." if b else "."
        else:
            s += f"You're **{-left:.0f} L over** your goal today."
        cats = defaultdict(float)
        for r in w.readings:
            if r.t.date() == w.today:
                cats[r.category] += r.litres
        if cats:
            s += "\n\nToday by category: " + ", ".join(f"{c} {v:.0f} L" for c, v in sorted(cats.items(), key=lambda x: -x[1]))
        return s

    def a_forecast(self):
        w = self.w
        if not w.ready:
            return self._need_data()
        L = [f"**Today:** on pace for **{w.proj:.0f} L** by midnight "
             f"(goal {self.goal} L, **{w.p_exceed * 100:.0f}%** chance of going over). "
             f"We're about {w.frac * 100:.0f}% through a typical day's usage."]
        nd = w.next_days(7)
        L.append("\n**Next 7 days:**")
        for d, p in nd:
            flag = " ⚠️ over goal" if p > self.goal else ""
            L.append(f"- {DOW[d.weekday()]} {d.day}/{d.month}: ~{p:.0f} L{flag}")
        over = [DOW[d.weekday()] for d, p in nd if p > self.goal]
        if over:
            L.append(f"\n🔮 Pattern says **{', '.join(over)}** are likely to cross your goal.")
        if w.accuracy is not None:
            L.append(f"\n*Model check: backtested on the last 7 days, typical error ±{w.mae:.0f} L "
                     f"(~{w.accuracy:.0f}% accurate).*")
        return "\n".join(L)

    def a_pattern(self):
        w = self.w
        if not w.ready:
            return self._need_data()
        L = ["**🧠 What I've learned about your usage**"]
        pk = w.peak_window()
        if pk:
            L.append(f"- **Peak window:** {fh(pk[0])}-{fh(pk[1])} - about {pk[2]:.0f}% of daily water.")
        prof = w.weekday_profile()
        wk = [v for k, v in prof.items() if k < 5]
        we = [v for k, v in prof.items() if k >= 5]
        if wk and we:
            diff = (statistics.mean(we) - statistics.mean(wk)) / statistics.mean(wk) * 100
            hi = max(prof, key=prof.get)
            L.append(f"- **Weekends:** {diff:+.0f}% vs weekdays. Heaviest day: **{DOW[hi]}** (~{prof[hi]:.0f} L).")
        for cat in ("Bath", "Housework", "Food/Drink"):
            h = w.category_peak(cat)
            if h is not None:
                L.append(f"- **{cat}** usually peaks around {fh(h)}.")
        cs = w.category_share()
        if cs:
            L.append("- **Where it goes (7 days):** " + ", ".join(f"{c} {p:.0f}%" for c, _, p in cs))
        tr = w.week_trend()
        if tr:
            arrow = "📈 rising" if tr[2] > 5 else "📉 falling" if tr[2] < -5 else "➡️ steady"
            L.append(f"- **Trend:** {arrow} - {tr[0]:.0f} L/day this week vs {tr[1]:.0f} L before ({tr[2]:+.0f}%).")
        L.append("- **Overnight flow:** " + ("⚠️ detected - possible leak" if w.night["leak"] else "none ✅ (no leak signature)"))
        return "\n".join(L)

    def a_anomaly(self, text=""):
        w, parts = self.w, []
        if w.night["leak"]:
            n = w.night
            parts.append(f"🚨 **Water:** steady overnight flow on {n['nights']} nights (~{n['avg']:.0f} L between "
                         f"{fh(NIGHT_HOURS[0])}-{fh(NIGHT_HOURS[1])}). Could waste up to **{n['waste_per_day']:.0f} L/day** "
                         "- check taps, flush tanks and the overhead tank float.")
        else:
            parts.append("✅ **Water:** no overnight flow, so no leak signature.")
        if w.spikes:
            d, v, z, med = w.spikes[-1]
            parts.append(f"📌 Most recent spike: **{DOW[d.weekday()]} {d.day}/{d.month}** at {v:.0f} L "
                         f"({v - med:.0f} L above a normal {'weekend' if d.weekday() >= 5 else 'weekday'} ~{med:.0f} L).")
        else:
            parts.append("✅ No abnormal usage days in the last 3 weeks.")
        if self.lpg.leak_suspected():
            parts.append(self._lpg_leak_text())
        else:
            parts.append("✅ **LPG:** weight is stable while the burner is off. If you ever smell gas, ventilate and "
                         "close the regulator first - don't wait for software.")
        return "\n\n".join(parts)

    def a_goal(self):
        w, goal = self.w, self.goal
        sv, over = w.saved_week()
        s = (f"Goal: **{goal} L/day**. Used **{w.so_far:.0f} L** so far (**{max(0, goal - w.so_far):.0f} L** left). "
             f"Current streak: **{w.streak()} day(s)** under goal. This week you saved **{sv:.0f} L** vs your goal")
        s += f" and went over on {over} day(s)." if over else " with no days over."
        if w.ready and w.proj:
            s += f"\n\nProjection: ~{w.proj:.0f} L today ({w.p_exceed * 100:.0f}% chance of exceeding)."
        return s

    def a_category(self):
        cs = self.w.category_share()
        if not cs:
            return "No category data yet."
        top = cs[0]
        return ("**Last 7 days by category:**\n" + "\n".join(f"- {c}: {v:.0f} L ({p:.0f}%)" for c, v, p in cs) +
                f"\n\n**{top[0]}** is your biggest use.")

    def a_compare(self):
        w = self.w
        tr = w.week_trend()
        if not tr:
            return self._need_data()
        s = (f"This week: **{tr[0]:.0f} L/day**. Previous week: **{tr[1]:.0f} L/day**. "
             f"Change: **{tr[2]:+.0f}%** " + ("🔺" if tr[2] > 5 else "🔻" if tr[2] < -5 else "➡️") + ".")
        now_c = {c: v for c, v, _ in w.category_share(7)}
        before = defaultdict(float)
        for d, _ in w.days[-14:-7]:
            for c, v in w.by_cat[d].items():
                before[c] += v
        diffs = sorted(((now_c.get(c, 0) - before.get(c, 0), c) for c in CATS), key=lambda x: -abs(x[0]))
        if diffs and abs(diffs[0][0]) > 5:
            s += f"\n\nBiggest mover: **{diffs[0][1]}** ({diffs[0][0] / 7:+.0f} L/day)."
        return s

    def a_lpg(self, text):
        g, p, t = self.lpg.gas, self.lpg.pct, text.lower()
        if any(k in t for k in ("leak", "smell")):
            return self._lpg_leak_text() if self.lpg.leak_suspected() else self.a_anomaly()
        if any(k in t for k in ("book", "refill", "order")):
            return "Booking isn't wired to a provider in this demo - plug your distributor's API in here and I'll auto-order at 20%."
        d, r = self.lpg.days_left(), self.lpg.burn_rate()
        s = f"LPG: **{g:.2f} kg** left (**{p:.0f}%**, cylinder total {g + TARE_KG:.1f} kg)."
        if d:
            s += f" At ~{r * 1000:.0f} g/hour it lasts about **{d:.1f} days**; I'd reorder around {max(1, d * 0.2):.1f} days left."
        return s + (" ⚠️ Running low." if p <= LOW_GAS_PCT else "")

    def a_tips(self):
        w, tips = self.w, []
        cs = w.category_share()
        if cs:
            c, v, p = cs[0]
            tips.append(f"**{c}** is {p:.0f}% of your water. Cutting just 10% there saves ~**{v / 7 * 0.1:.0f} L/day** "
                        f"(~{v / 7 * 0.1 * 30 / 1000:.1f} kL a month).")
        b = w.avg_per_use("Bath")
        if b and b > 35:
            tips.append(f"Your average bath/shower is **{b:.0f} L**. A bucket bath or a 2-minute-shorter shower brings it to ~{b * 0.7:.0f} L.")
        prof = w.weekday_profile()
        if prof and max(prof.values()) > self.goal:
            hi = max(prof, key=prof.get)
            tips.append(f"**{DOW[hi]}s** average {prof[hi]:.0f} L - above your goal. Spread laundry and cleaning across weekdays.")
        if w.night["leak"]:
            tips.append("Fix the overnight flow first: that's pure waste.")
        if w.ready and w.p_exceed is not None and w.p_exceed > 0.5:
            tips.append(f"Today you're likely to go over. Skipping one {b or 40:.0f} L bath/wash gets you back under goal." if b else
                        "Today you're likely to go over - postpone heavy chores to tomorrow.")
        tips.append(random.choice([
            "Reuse RO reject water for mopping or plants.",
            "Turn the tap off while brushing or scrubbing - saves ~6 L a time.",
            "Run washing machine only on full loads."]))
        return "**💡 Smart tips from your data**\n" + "\n".join(f"- {t}" for t in tips)

    def a_how(self):
        w = self.w
        s = ("I read the same readings as the UTLT.ai app (time, litres, category) and learn your daily rhythm. "
             "Forecasts blend your recent level (EWMA), same-weekday history and trend; the end-of-day projection "
             "adjusts for how today is actually going. Leaks come from overnight flow and abnormal days from a robust z-score.")
        if w.accuracy is not None:
            s += f"\n\nBacktest: typical error ±{w.mae:.0f} L/day (~{w.accuracy:.0f}% accurate)."
        return s + f"\n\nData source: **{'your readings.json' if self.source == 'file' else 'built-in demo data'}** ({len(self.readings)} readings)."

    OFFERS = {  # what I offer after each answer -> what "yes / bet" should trigger
        "status": ("forecast", "Want me to predict the next 7 days?"),
        "forecast": ("pattern", "Want to see the patterns behind that?"),
        "pattern": ("tips", "Want tips to improve it?"),
        "tips": ("anomaly", "Want me to check for leaks and spikes too?"),
    }

    def greeting(self):
        self.pending = "forecast"
        return self.status() + "\n\n" + self.OFFERS["status"][1]

    def reply(self, text):
        self.refresh()
        i = self.intent(text)
        t = text.lower()
        if i == "yes":
            i = self.pending or "status"
        elif i == "no":
            self.pending = None
            return random.choice(["No worries! I'm here whenever you need me.", "All good - just ask when you're ready."])
        elif i == "bye":
            self.pending = None
            return "See you! I'll keep watching your water and gas. 👋"
        self.pending = None
        out = self._answer(i, t)
        if i in self.OFFERS:
            self.pending, offer = self.OFFERS[i]
            out += "\n\n" + offer
        return out

    def _answer(self, i, t):
        if i == "hello":
            self.pending = "status"
            return random.choice(["Hey! I'm tracking your water and gas live. Want a quick **status**?",
                                  "Hi there! Want a quick status check or a prediction?"])
        if i == "status":
            return self.status()
        if i == "today":
            return self.a_today()
        if i == "forecast":
            return self.a_forecast()
        if i == "pattern":
            return self.a_pattern()
        if i == "anomaly":
            return self.a_anomaly(t)
        if i == "goal":
            return self.a_goal()
        if i == "category":
            return self.a_category()
        if i == "compare":
            return self.a_compare()
        if i == "lpg":
            return self.a_lpg(t)
        if i == "tips":
            return self.a_tips()
        if i == "how":
            return self.a_how()
        if i == "help":
            return ("Try: *status*, *predict tomorrow*, *my patterns*, *am I over my goal*, *any leaks?*, "
                    "*compare to last week*, *where is my water going*, *gas level*, *tips*. "
                    "You can also just say *bet* / *yes* when I offer something.")
        if i == "thanks":
            return "Anytime! 🙌"
        keys = [k for v in INTENTS.values() for k in v]
        m = difflib.get_close_matches(t.strip(), keys, n=1, cutoff=0.5)
        return "I didn't quite get that." + (f" Did you mean *{m[0]}*?" if m else "") + " Type **help** for options."