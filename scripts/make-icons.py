"""
Generates the whole icon set from one mark, so the app has a real identity on
a phone's home screen, a browser tab and a taskbar rather than whatever the
browser invents when an icon fails to load.

The mark: a gate, and the team standing in it — two promoters and, lit white
between them, the one who leads them. It is the object the whole product is
organised around, and it reads as a gate at a glance even when it is the size
of a fingernail.

Three things matter and are easy to get wrong:

  * The small sizes are DRAWN, not shrunk. At 16px the three dots of the full
    mark merge into one grey smudge and the gate's inner gap closes, so the
    16 and 32 pixel icons use a simplified mark — one dot, thicker walls,
    wider gaps — and only 48px and up get the real thing.
  * favicon.ico carries 16/32/48 together. A browser that cannot find
    /favicon.ico falls back to a generated letter tile, which is where a
    strange coloured icon comes from.
  * The maskable icon keeps its safe zone: Android crops it to a circle, and
    anything outside the middle 80% is cut off.

Run:  python3 scripts/make-icons.py
Out:  public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon,
                    favicon-16,favicon-32,favicon-48}.png
      public/icons/mark.svg   public/favicon.ico
"""

import math

from PIL import Image, ImageDraw
import os

OUT = "public/icons"

INK = (10, 9, 8)            # #0A0908 — the operational black
BRAND = (228, 88, 74)       # #E4584A — the Ticket Zone red
WHITE = (255, 255, 255)

SS = 8  # supersampling: draw large, shrink once, so every curve is clean


def plate(size, bg, radius_ratio=0.28):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1],
                        radius=int(size * radius_ratio), fill=bg)
    return img, d


def mark(d, size, ink, pad_ratio=0.17, bracket=True):
    """
    The Ticket Zone mark: a star held between two brackets.

    The brackets are the gate seen from above and the star is what is going on
    inside it, which is the company's own mark and the one people already
    recognise. Drawn here rather than scaled from a file so that the small
    sizes can leave the brackets off: at sixteen pixels two 2-pixel uprights
    either side of a star are three grey smudges, and the star alone still
    reads as this app.
    """
    pad = int(size * pad_ratio)
    inner = size - pad * 2
    stroke = max(2, int(inner * 0.085))
    r = stroke // 2

    if bracket:
        arm = int(inner * 0.20)
        top = pad + int(inner * 0.06)
        bottom = pad + inner - int(inner * 0.06)
        for x0, x1 in ((pad, pad + arm), (pad + inner - arm, pad + inner)):
            # the upright
            ux = x0 if x0 == pad else x1 - stroke
            d.rounded_rectangle([ux, top, ux + stroke, bottom], radius=r, fill=ink)
            # the two returns
            d.rounded_rectangle([x0, top, x1, top + stroke], radius=r, fill=ink)
            d.rounded_rectangle([x0, bottom - stroke, x1, bottom], radius=r, fill=ink)

    # The star, centred, sized to sit inside the brackets with room to breathe.
    cx, cy = size / 2, size / 2
    outer = inner * (0.30 if bracket else 0.42)
    innerr = outer * 0.46
    points = []
    for i in range(10):
        angle = -math.pi / 2 + i * math.pi / 5
        radius = outer if i % 2 == 0 else innerr
        points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    d.polygon(points, fill=ink)


def render(size, bg, ink, pad_ratio=0.17, bracket=True, radius_ratio=0.28):
    s = size * SS
    img, d = plate(s, bg, radius_ratio)
    mark(d, s, ink, pad_ratio=pad_ratio, bracket=bracket)
    return img.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)

# The full mark, for anywhere there is room for it.
render(512, BRAND, WHITE).save(f"{OUT}/icon-512.png")
render(192, BRAND, WHITE).save(f"{OUT}/icon-192.png")
render(180, BRAND, WHITE).save(f"{OUT}/apple-touch-icon.png")
render(64, BRAND, WHITE).save(f"{OUT}/favicon.png")
render(48, BRAND, WHITE, pad_ratio=0.15).save(f"{OUT}/favicon-48.png")

# A maskable icon is cropped by the launcher into whatever shape that
# launcher uses, so it fills the square corner to corner — rounding it here
# would leave four transparent notches under a squircle mask — and the mark
# pulls into the middle 80% where no crop can reach it.
render(512, BRAND, WHITE, pad_ratio=0.26, radius_ratio=0)\
    .save(f"{OUT}/icon-maskable-512.png")

# Drawn, not shrunk. At 32 the brackets survive; at 16 they would be three
# grey smudges either side of the star, so the star stands alone.
render(32, BRAND, WHITE, pad_ratio=0.13).save(f"{OUT}/favicon-32.png")
render(16, BRAND, WHITE, pad_ratio=0.10, bracket=False).save(f"{OUT}/favicon-16.png")

# One .ico carrying all three, for the tab, the bookmark bar and Windows.
Image.open(f"{OUT}/favicon-16.png").save(
    "public/favicon.ico", format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=[Image.open(f"{OUT}/favicon-32.png"),
                   Image.open(f"{OUT}/favicon-48.png")],
)

# The same mark as vector, for print and anywhere it has to scale.
open(f"{OUT}/mark.svg", "w", encoding="utf-8").write(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" '
    'viewBox="0 0 32 32" fill="none">\n'
    '  <rect width="32" height="32" rx="9" fill="#E4584A"/>\n'
    '  <path d="M9.5 8.5H7.25C6.56 8.5 6 9.06 6 9.75v12.5c0 .69.56 1.25 1.25 '
    '1.25H9.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>\n'
    '  <path d="M22.5 8.5h2.25c.69 0 1.25.56 1.25 1.25v12.5c0 .69-.56 1.25-1.25 '
    '1.25H22.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>\n'
    '  <path d="M16 9.6l1.84 3.84 4.12.62-2.98 2.99.7 4.23L16 19.29l-3.68 '
    '1.99.7-4.23-2.98-2.99 4.12-.62L16 9.6z" fill="#fff"/>\n'
    '</svg>\n'
)

print("icons written")
