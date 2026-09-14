"""
Generates the demo venue map used by the seed data (Al-Zawraa Stadium layout).

This is a schematic operations map — a plan view of the bowl, the perimeter
ring road, eight numbered gates and the service areas — drawn so that the
normalized marker coordinates in src/db/seed.ts land on the right features.

Run:  python3 scripts/make-demo-map.py
Out:  public/maps/al-zawraa-stadium.png  (1600 x 1000)
"""

from PIL import Image, ImageDraw, ImageFont
import math
import os

W, H = 1600, 1000
CX, CY = W / 2, H / 2

BG = (15, 21, 30)
GRASS = (26, 71, 47)
GRASS_STRIPE = (30, 81, 54)
STAND = (32, 41, 55)
STAND_EDGE = (54, 67, 87)
CONCOURSE = (22, 29, 40)
RING = (44, 55, 72)
LINE = (226, 240, 233)
LABEL = (148, 163, 184)
GATE_FILL = (16, 185, 129)
SERVICE_FILL = (59, 130, 246)


def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img, "RGBA")

# --- perimeter / site boundary ------------------------------------------------
d.rounded_rectangle([28, 28, W - 28, H - 28], radius=26, fill=CONCOURSE,
                    outline=(58, 72, 94), width=3)

# faint site grid
for x in range(60, W - 40, 80):
    d.line([(x, 40), (x, H - 40)], fill=(255, 255, 255, 8), width=1)
for y in range(60, H - 40, 80):
    d.line([(40, y), (W - 40, y)], fill=(255, 255, 255, 8), width=1)

# --- ring road ---------------------------------------------------------------
d.ellipse([CX - 640, CY - 400, CX + 640, CY + 400], outline=RING, width=26)
d.ellipse([CX - 640, CY - 400, CX + 640, CY + 400], outline=(70, 85, 108), width=2)

# --- stadium bowl ------------------------------------------------------------
d.ellipse([CX - 520, CY - 320, CX + 520, CY + 320], fill=STAND, outline=STAND_EDGE, width=4)
d.ellipse([CX - 430, CY - 258, CX + 430, CY + 258], fill=(38, 48, 64), outline=STAND_EDGE, width=3)
d.ellipse([CX - 350, CY - 205, CX + 350, CY + 205], fill=(25, 33, 45), outline=STAND_EDGE, width=2)

# tier separators
for a in range(0, 360, 15):
    r = math.radians(a)
    x1 = CX + 355 * math.cos(r)
    y1 = CY + 208 * math.sin(r)
    x2 = CX + 518 * math.cos(r)
    y2 = CY + 318 * math.sin(r)
    d.line([(x1, y1), (x2, y2)], fill=(255, 255, 255, 16), width=2)

# --- pitch -------------------------------------------------------------------
PX0, PY0, PX1, PY1 = CX - 290, CY - 165, CX + 290, CY + 165
d.rectangle([PX0, PY0, PX1, PY1], fill=GRASS)
stripe_w = (PX1 - PX0) / 12
for i in range(12):
    if i % 2 == 0:
        d.rectangle([PX0 + i * stripe_w, PY0, PX0 + (i + 1) * stripe_w, PY1],
                    fill=GRASS_STRIPE)
d.rectangle([PX0, PY0, PX1, PY1], outline=LINE, width=3)
d.line([(CX, PY0), (CX, PY1)], fill=LINE, width=3)
d.ellipse([CX - 52, CY - 52, CX + 52, CY + 52], outline=LINE, width=3)
d.ellipse([CX - 4, CY - 4, CX + 4, CY + 4], fill=LINE)
# penalty areas
d.rectangle([PX0, CY - 88, PX0 + 78, CY + 88], outline=LINE, width=3)
d.rectangle([PX1 - 78, CY - 88, PX1, CY + 88], outline=LINE, width=3)
d.rectangle([PX0, CY - 40, PX0 + 30, CY + 40], outline=LINE, width=2)
d.rectangle([PX1 - 30, CY - 40, PX1, CY + 40], outline=LINE, width=2)

f_pitch = font(20, True)
d.text((CX, PY1 + 26), "PITCH", font=f_pitch, fill=(168, 200, 182), anchor="mm")

# --- gates -------------------------------------------------------------------
# Angles chosen so the eight gates ring the bowl evenly, starting east.
gates = [
    ("GATE 1", 0),
    ("GATE 2", 45),
    ("GATE 3", 90),
    ("GATE 4", 135),
    ("GATE 5", 180),
    ("GATE 6", 225),
    ("GATE 7", 270),
    ("GATE 8", 315),
]
f_gate = font(19, True)
f_small = font(14)

for name, angle in gates:
    r = math.radians(angle)
    gx = CX + 596 * math.cos(r)
    gy = CY + 372 * math.sin(r)
    d.rounded_rectangle([gx - 52, gy - 22, gx + 52, gy + 22], radius=9,
                        fill=(11, 61, 46), outline=GATE_FILL, width=3)
    d.text((gx, gy), name, font=f_gate, fill=(209, 250, 229), anchor="mm")
    # walkway from gate to bowl
    bx = CX + 524 * math.cos(r)
    by = CY + 324 * math.sin(r)
    d.line([(gx, gy), (bx, by)], fill=(255, 255, 255, 40), width=8)


def service_box(cx, cy, w, h, label, sub=""):
    d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], radius=8,
                        fill=(14, 33, 60), outline=SERVICE_FILL, width=2)
    if sub:
        d.text((cx, cy - 9), label, font=f_small, fill=(191, 219, 254), anchor="mm")
        d.text((cx, cy + 10), sub, font=font(12), fill=(125, 155, 200), anchor="mm")
    else:
        d.text((cx, cy), label, font=f_small, fill=(191, 219, 254), anchor="mm")


# --- service / working areas -------------------------------------------------
service_box(232, 150, 190, 54, "SCANNING AREA", "electronic tickets")
service_box(1368, 150, 190, 54, "WRISTBAND AREA", "distribution")
service_box(232, 852, 190, 54, "VIP RECEPTION", "west stand")
service_box(1368, 852, 190, 54, "INFORMATION", "main plaza")
service_box(CX - 300, 88, 210, 50, "STAFF ENTRANCE", "north service road")
service_box(CX + 300, 916, 210, 50, "PLAYERS ENTRANCE", "south tunnel")
service_box(96, CY, 116, 70, "EMERGENCY", "assembly")
service_box(1504, CY, 116, 70, "MEDIA", "press gate")

# --- title block -------------------------------------------------------------
d.rounded_rectangle([44, 44, 392, 108], radius=10, fill=(10, 15, 23, 220),
                    outline=(58, 72, 94), width=2)
d.text((64, 62), "AL-ZAWRAA STADIUM", font=font(22, True), fill=(226, 240, 233))
d.text((64, 88), "Operations layout - schematic, not to scale",
       font=font(13), fill=LABEL)

# --- north arrow + scale -----------------------------------------------------
d.line([(1520, 96), (1520, 44)], fill=LABEL, width=3)
d.polygon([(1520, 38), (1512, 56), (1528, 56)], fill=LABEL)
d.text((1520, 112), "N", font=font(16, True), fill=LABEL, anchor="mm")

os.makedirs("public/maps", exist_ok=True)
img.save("public/maps/al-zawraa-stadium.png", optimize=True)
print("wrote public/maps/al-zawraa-stadium.png", img.size)
