"""
Generates the PWA icon set from one mark, so the app has a real identity on a
phone home screen rather than a browser screenshot.

The mark: the operations monogram on the dark operational ground, with a gate
arch — the object the whole product is organised around.

Run:  python3 scripts/make-icons.py
Out:  public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
      public/icons/favicon.png
"""

from PIL import Image, ImageDraw, ImageFont
import os

BG = (13, 17, 23)
BRAND = (16, 185, 129)
BRAND_DARK = (5, 150, 105)
INK = (232, 237, 244)


def font(size, bold=True):
    path = ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
            else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    if os.path.exists(path):
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_mark(size, padding_ratio, rounded, bg):
    """padding_ratio leaves the safe zone maskable icons need."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if rounded:
        r = int(size * 0.22)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=bg)
    else:
        d.rectangle([0, 0, size - 1, size - 1], fill=bg)

    pad = int(size * padding_ratio)
    inner = size - pad * 2

    # Gate arch — two posts and a lintel, the shape of an entrance.
    post_w = int(inner * 0.15)
    arch_top = pad + int(inner * 0.20)
    arch_bottom = pad + int(inner * 0.78)
    left = pad + int(inner * 0.16)
    right = pad + inner - int(inner * 0.16)

    d.rounded_rectangle(
        [left, arch_top, left + post_w, arch_bottom],
        radius=post_w // 3, fill=BRAND,
    )
    d.rounded_rectangle(
        [right - post_w, arch_top, right, arch_bottom],
        radius=post_w // 3, fill=BRAND,
    )
    d.rounded_rectangle(
        [left, arch_top, right, arch_top + post_w],
        radius=post_w // 3, fill=BRAND,
    )

    # Three staff markers standing in the gateway.
    dot_r = max(2, int(inner * 0.045))
    cy = arch_bottom - int(inner * 0.12)
    span = (right - post_w) - (left + post_w)
    for i in range(3):
        cx = left + post_w + span * (i + 1) / 4
        fill = INK if i == 1 else BRAND_DARK
        d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=fill)

    # Ground line.
    d.rounded_rectangle(
        [left, arch_bottom, right, arch_bottom + max(2, int(inner * 0.035))],
        radius=2, fill=(47, 58, 76),
    )
    return img


os.makedirs("public/icons", exist_ok=True)

# Standard icons: rounded tile, normal padding.
for size in (192, 512):
    draw_mark(size, 0.13, rounded=True, bg=BG).save(
        f"public/icons/icon-{size}.png", optimize=True)

# Maskable: Android crops to a circle, so the mark needs a wider safe zone and
# the background must bleed to the full square.
draw_mark(512, 0.24, rounded=False, bg=BG).save(
    "public/icons/icon-maskable-512.png", optimize=True)

# iOS: no transparency, no rounding of our own — the OS masks it.
draw_mark(180, 0.13, rounded=False, bg=BG).convert("RGB").save(
    "public/icons/apple-touch-icon.png", optimize=True)

draw_mark(64, 0.10, rounded=True, bg=BG).save(
    "public/icons/favicon.png", optimize=True)

print("wrote public/icons/*.png")
