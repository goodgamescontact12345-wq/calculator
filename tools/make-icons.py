#!/usr/bin/env python3
"""Generate the home-screen icons for the calculator PWA.

Run from anywhere:  python3 tools/make-icons.py
Outputs into ./icons/ — black rounded-by-iOS tile with the "67" mark.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

S = 2048  # master render size, downsampled for clean edges
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"

BG = "#08080a"
WHITE = "#ffffff"
ORANGE = "#ff9f0a"
GLOW = "#ff2d55"


def radial_glow(size, color, radius_ratio, falloff_steps=4):
    """Soft circular gradient used behind the numerals."""
    glow = Image.new("RGB", (size, size), "#000000")
    draw = ImageDraw.Draw(glow)
    radius = int(size * radius_ratio)
    r, g, b = (int(c, 16) for c in (color[1:3], color[3:5], color[5:7]))
    for rad in range(radius, 0, -falloff_steps):
        t = 1 - rad / radius
        draw.ellipse(
            [size / 2 - rad, size / 2 - rad * 0.94, size / 2 + rad, size / 2 + rad * 0.94],
            fill=(int(r * 0.5 * t * t), int(g * 0.5 * t * t), int(b * 0.5 * t * t)),
        )
    return glow.filter(ImageFilter.GaussianBlur(size * 0.045))


def make_master():
    base = Image.new("RGB", (S, S), BG)
    base = ImageChops.screen(base, radial_glow(S, GLOW, 0.55))

    font = ImageFont.load_default(size=int(S * 0.56))
    ascent, descent = font.getmetrics()
    baseline = S * 0.5 + (ascent - descent) * 0.5

    w6 = font.getlength("6")
    w7 = font.getlength("7")
    gap = S * 0.028
    x0 = (S - (w6 + w7 + gap)) / 2
    positions = ((x0, "6"), (x0 + w6 + gap, "7"))

    def paint(draw, color, stroke_width=0):
        for x, glyph in positions:
            draw.text(
                (x, baseline), glyph, font=font, anchor="ls",
                fill=color, stroke_width=stroke_width, stroke_fill=color,
            )

    # glow pass: one blurred mask of the pair, tinted crimson
    mask = Image.new("L", (S, S), 0)
    paint(ImageDraw.Draw(mask), 255)
    alpha = mask.filter(ImageFilter.GaussianBlur(S * 0.045)).point(lambda v: int(v * 0.7))
    tinted = Image.composite(
        Image.new("RGB", (S, S), GLOW), Image.new("RGB", (S, S), "#000000"), alpha
    )
    base = ImageChops.screen(base, tinted)

    # crisp numerals, slight stroke so the light weight still reads at 60px
    stroke = max(2, int(S * 0.032))
    text = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(text)
    draw.text(
        (positions[0][0], baseline), "6", font=font, anchor="ls",
        fill=WHITE, stroke_width=stroke, stroke_fill=WHITE,
    )
    draw.text(
        (positions[1][0], baseline), "7", font=font, anchor="ls",
        fill=ORANGE, stroke_width=stroke, stroke_fill=ORANGE,
    )
    return Image.alpha_composite(base.convert("RGBA"), text).convert("RGB")


def maskable(master):
    """Same art shrunk into the 80% safe zone Android masks require."""
    inner = master.resize((int(S * 0.80), int(S * 0.80)), Image.LANCZOS)
    canvas = Image.new("RGB", (S, S), BG)
    canvas.paste(inner, ((S - inner.width) // 2, (S - inner.height) // 2))
    return canvas


def main():
    OUT.mkdir(exist_ok=True)
    master = make_master()

    outputs = [
        (master, 1024, "icon-1024.png"),
        (master, 512, "icon-512.png"),
        (master, 192, "icon-192.png"),
        (master, 180, "icon-180.png"),
        (master, 32, "favicon-32.png"),
        (maskable(master), 512, "icon-maskable-512.png"),
    ]

    for image, size, name in outputs:
        path = OUT / name
        image.resize((size, size), Image.LANCZOS).save(path, optimize=True)
        print(f"wrote {path.relative_to(ROOT)} ({size}x{size})")


if __name__ == "__main__":
    main()
