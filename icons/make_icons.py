"""
Einmal-Skript, das ein einfaches Platzhalter-Icon erzeugt (ein Muenz-Symbol
auf warmem Orange). Wird nicht von der App selbst gebraucht - nur um die
PNG-Dateien in diesem Ordner zu erzeugen. Kann spaeter durch ein echtes
Icon ersetzt werden.
"""
from PIL import Image, ImageDraw, ImageFont

BG = (245, 158, 11)      # warmes Orange
FG = (255, 255, 255)     # Weiss fuer das Symbol

def make_icon(size, path):
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)

    # Muenze als Kreis
    margin = size * 0.18
    draw.ellipse([margin, margin, size - margin, size - margin], outline=FG, width=max(2, size // 22))

    # Euro-Zeichen in die Mitte
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", int(size * 0.42))
    except OSError:
        font = ImageFont.load_default()

    text = "€"
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), text, fill=FG, font=font)

    img.save(path)

make_icon(192, "icon-192.png")
make_icon(512, "icon-512.png")
make_icon(180, "apple-touch-icon.png")
print("Icons erzeugt")
