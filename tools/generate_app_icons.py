"""Create the two installable UTLT.ai app icons from one simple droplet shape."""

from math import cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "assets"
size = 1024
image = Image.new("RGB", (size, size), "#212121")
draw = ImageDraw.Draw(image)
points = [(size * 0.5, size * 0.18)]
for step in range(1, 51):
    t = step / 50
    points.append((size * (0.5 - 0.23 * (2 * t - t * t)), size * (0.18 + 0.42 * t)))
for step in range(51):
    angle = pi - pi * step / 50
    points.append((size * (0.5 + 0.23 * cos(angle)), size * (0.6 + 0.23 * sin(angle))))
for step in range(1, 51):
    t = step / 50
    points.append((size * (0.73 - 0.23 * t * t), size * (0.6 - 0.42 * t)))
draw.polygon(points, fill="#1688f8")
for output_size in (192, 512):
    image.resize((output_size, output_size), Image.Resampling.LANCZOS).save(root / f"utlt-icon-{output_size}.png")
