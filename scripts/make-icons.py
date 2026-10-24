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

from PIL import Image, ImageDraw
import os

OUT = "public/icons"

INK = (10, 9, 8)            # #0A0908 — the operational black
BRAND = (228, 88, 74)       # #E4584A — the Ticket Zone red
WHITE = (255, 255, 255)

SS = 8  # supersampling: draw large, shrink once, so every curve is clean


def plate(size, bg, radius_ratio=0.225):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1],
                        radius=int(size * radius_ratio), fill=bg)
    return img, d


def gate(d, box, mark, hole, dots=3, wall_ratio=0.135, lead=WHITE):
    """
    Draws the gate inside `box` = (x0, y0, x1, y1).

    `mark` paints the gate, `hole` paints what shows through it — on the dark
    plate that is the plate itself, which is why the colour is passed in
    rather than punched out as transparency: a hole would also cut the dots.
    """
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    wall = int(w * wall_ratio)
    r_out = int(w * 0.20)

    foot_h = int(h * 0.085)
    body_bottom = y1 - foot_h

    # The arch: a rounded block, squared off along the bottom so the gate
    # stands ON its foot instead of hovering a hair above it, then the inner
    # volume painted back over it.
    d.rounded_rectangle([x0, y0, x1, body_bottom], radius=r_out, fill=mark)
    d.rectangle([x0, body_bottom - r_out, x1, body_bottom], fill=mark)
    d.rounded_rectangle(
        [x0 + wall, y0 + wall, x1 - wall, body_bottom - wall],
        radius=int(r_out * 0.55), fill=hole,
    )

    # The foot: a little wider than the gate, so the mark sits down rather
    # than floats.
    foot = int(w * 0.055)
    d.rounded_rectangle([x0 - foot, body_bottom, x1 + foot, y1],
                        radius=foot_h // 2, fill=mark)

    # The team, standing on the floor of the gate.
    cy = y1 - int(h * 0.085) - wall - int(w * 0.105)
    cx = (x0 + x1) // 2
    r_side = int(w * 0.082)
    r_lead = int(w * 0.098)
    gap = int(w * 0.215)
    if dots == 3:
        for sx in (-1, 1):
            d.ellipse([cx + sx * gap - r_side, cy - r_side,
                       cx + sx * gap + r_side, cy + r_side], fill=mark)
    d.ellipse([cx - r_lead, cy - r_lead, cx + r_lead, cy + r_lead], fill=lead)


def render(size, bg, mark, pad_ratio=0.17, dots=3, wall_ratio=0.135,
           radius_ratio=0.225, lead=WHITE):
    s = size * SS
    img, d = plate(s, bg, radius_ratio)
    pad = int(s * pad_ratio)
    gate(d, (pad, int(s * 0.145), s - pad, s - int(s * 0.17)),
         mark, bg, dots=dots, wall_ratio=wall_ratio, lead=lead)
    return img.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)

# The full mark, for anywhere there is room for it.
render(512, INK, BRAND).save(f"{OUT}/icon-512.png")
render(192, INK, BRAND).save(f"{OUT}/icon-192.png")
render(180, INK, BRAND).save(f"{OUT}/apple-touch-icon.png")
render(64, INK, BRAND).save(f"{OUT}/favicon.png")
render(48, INK, BRAND, pad_ratio=0.15).save(f"{OUT}/favicon-48.png")

# Android crops a maskable icon to a circle, so the mark pulls in to the
# middle 80% and the red fills the plate — a dark square cropped round reads
# as a hole in the launcher.
# The leader is whatever the gate is not: white inside a red gate, and the
# plate's own colour when the gate itself is white — otherwise the three
# figures melt into one.
render(512, BRAND, WHITE, pad_ratio=0.275, radius_ratio=0.5, lead=BRAND)\
    .save(f"{OUT}/icon-maskable-512.png")

# Drawn, not shrunk: thicker walls, wider gaps, and at 16px one figure only.
render(32, INK, BRAND, pad_ratio=0.12, wall_ratio=0.17, dots=3)\
    .save(f"{OUT}/favicon-32.png")
render(16, INK, BRAND, pad_ratio=0.08, wall_ratio=0.21, dots=1)\
    .save(f"{OUT}/favicon-16.png")

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
    'viewBox="0 0 512 512" fill="none">\n'
    '  <rect width="512" height="512" rx="115" fill="#0A0908"/>\n'
    '  <path d="M87 174a102 102 0 0 1 102-102h134a102 102 0 0 1 102 102v202H87z" '
    'fill="#E4584A"/>\n'
    '  <path d="M145 212a57 57 0 0 1 57-57h108a57 57 0 0 1 57 57v164H145z" '
    'fill="#0A0908"/>\n'
    '  <rect x="64" y="376" width="384" height="46" rx="23" fill="#E4584A"/>\n'
    '  <circle cx="168" cy="330" r="34" fill="#E4584A"/>\n'
    '  <circle cx="344" cy="330" r="34" fill="#E4584A"/>\n'
    '  <circle cx="256" cy="330" r="41" fill="#fff"/>\n'
    '</svg>\n'
)

print("icons written")
