"""
tools/unify_assets.py
Removes white/near-white backgrounds, scales, and applies a unified
post-apocalyptic color grade to game sprites.

Usage:
  python tools/unify_assets.py public/assets/some_sprite.png [output.png]
  python tools/unify_assets.py  (processes all registered sprites in-place)
"""

import sys
import os
from PIL import Image, ImageEnhance, ImageFilter

# ── Config ────────────────────────────────────────────────────────────────────
BG_TOLERANCE  = 40     # how close to white counts as "background"
CONTRAST      = 1.25   # contrast boost
SATURATION    = 0.78   # slight desaturation → grungy
BRIGHTNESS    = 0.92   # very slight darkening
# Warm amber tint overlay (R, G, B, A) — subtle nuclear haze
TINT_COLOR    = (255, 200, 140)
TINT_STRENGTH = 0.10   # 0=no tint, 1=full tint

# Sprites to upscale and their target heights in px (0 = no upscale)
SCALE_TARGETS = {
    'player_placeholder.png': 90,
    'enemy_zombie.png':       70,
    'enemy_archer.png':       70,
    'enemy_boss.png':        110,
    'floor_tile.png':          0,   # tile — keep original size
}


def remove_bg(img: Image.Image, tolerance: int = BG_TOLERANCE) -> Image.Image:
    """Replace near-white pixels with transparency."""
    img = img.convert('RGBA')
    data = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = data[x, y]
            # White or near-white: make transparent
            if r > 255 - tolerance and g > 255 - tolerance and b > 255 - tolerance:
                data[x, y] = (r, g, b, 0)
    return img


def scale_to_height(img: Image.Image, target_h: int) -> Image.Image:
    if target_h <= 0 or img.height == target_h:
        return img
    ratio = target_h / img.height
    new_w = max(1, round(img.width * ratio))
    return img.resize((new_w, target_h), Image.NEAREST)


def color_grade(img: Image.Image) -> Image.Image:
    """Apply contrast, saturation, brightness and a subtle warm tint."""
    # Work on the RGB channels separately from alpha
    has_alpha = img.mode == 'RGBA'
    if has_alpha:
        alpha = img.split()[3]
        rgb = img.convert('RGB')
    else:
        rgb = img.convert('RGB')
        alpha = None

    rgb = ImageEnhance.Contrast(rgb).enhance(CONTRAST)
    rgb = ImageEnhance.Color(rgb).enhance(SATURATION)
    rgb = ImageEnhance.Brightness(rgb).enhance(BRIGHTNESS)

    # Warm tint
    tint = Image.new('RGB', rgb.size, TINT_COLOR)
    rgb = Image.blend(rgb, tint, TINT_STRENGTH)

    if has_alpha and alpha:
        rgb = rgb.convert('RGBA')
        rgb.putalpha(alpha)

    return rgb


def process(src: str, dst: str = None) -> str:
    if dst is None:
        dst = src
    img = Image.open(src)
    img = remove_bg(img)
    name = os.path.basename(src)
    target_h = SCALE_TARGETS.get(name, 0)
    img = scale_to_height(img, target_h)
    img = color_grade(img)
    img.save(dst, 'PNG')
    print(f'  processed {src} -> {dst}  ({img.size[0]}x{img.size[1]})')
    return dst


if __name__ == '__main__':
    if len(sys.argv) >= 2:
        src = sys.argv[1]
        dst = sys.argv[2] if len(sys.argv) >= 3 else src
        process(src, dst)
    else:
        # Batch: process all registered sprites in public/assets/
        assets_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
        for name in SCALE_TARGETS:
            path = os.path.join(assets_dir, name)
            if os.path.exists(path):
                process(path)
            else:
                print(f'  SKIP (not found): {path}')
