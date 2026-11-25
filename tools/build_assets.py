"""Подготовка производных графических ресурсов Fincode.

Скрипт читает исходники заказчика из корня проекта и формирует ресурсы приложения:

    public/assets/brand/fincode-logo-light.png  <- Fincode_logo_blue_color_d.png
    public/assets/brand/fincode-logo-dark.png   <- ChatGPT Image ... 15_53_37.png
    public/assets/brand/fincode-fingerprint.webp <- отпечаток из светлого логотипа

Отпечаток один и тот же в обеих темах: в светлой он показывается с
непрозрачностью 0.30, в тёмной — 0.55 (см. src/styles/tokens.css).

Дополнительно копии исходников складываются в assets/brand/source/ (ASCII-имена),
а в tools/_preview/ сохраняются контрольные композиции рабочей области.

Запуск: python tools/build_assets.py
"""

from __future__ import annotations

import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SRC_LIGHT = "Fincode_logo_blue_color_d.png"
SRC_DARK = "ChatGPT Image 21 сент. 2026 г., 15_53_37.png"
SRC_REFERENCE = "ChatGPT Image 21 сент. 2026 г., 15_58_55.png"

OUT_BRAND = os.path.join(ROOT, "public", "assets", "brand")
OUT_SOURCE = os.path.join(ROOT, "assets", "brand", "source")
OUT_PREVIEW = os.path.join(ROOT, "tools", "_preview")

# Контейнер логотипа в сайдбаре: 190 x 76 CSS px, экспорт в 2x.
LOGO_BOX = (190, 76)
SCALE = 2
# Ширина знака «fincode» без слогана внутри канваса (в пикселях канваса).
# Нормализация по ширине: знак занимает одинаковое место в обеих темах.
WORDMARK_W = 372
WORDMARK_POS = (4, 4)

# Отпечаток из светлого логотипа (зона буквы «o»), с запасом по краям.
FINGERPRINT_BOX = (1625, 290, 2213, 879)

BG_WORKSPACE_DARK = np.array([8, 15, 36], dtype=np.float32)
BG_WORKSPACE_LIGHT = np.array([245, 246, 250], dtype=np.float32)

PREVIEW_WORKSPACE = (1192, 815)  # рабочая область при 1440 x 900
PREVIEW_DECOR_W = 610
DECOR_OPACITY_LIGHT = 0.30
DECOR_OPACITY_DARK = 0.55


def load_rgba(path: str) -> np.ndarray:
    with Image.open(path) as im:
        return np.asarray(im.convert("RGBA")).astype(np.float32)


def to_image(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8), "RGBA")


def resize_rgba(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Масштабирование с премультипликацией: без тёмных ореолов на кромках."""
    arr = np.asarray(img.convert("RGBA")).astype(np.float32)
    a = arr[..., 3:4] / 255.0
    premultiplied = np.concatenate([arr[..., :3] * a, arr[..., 3:4]], axis=2)
    small = Image.fromarray(np.clip(premultiplied + 0.5, 0, 255).astype(np.uint8), "RGBA")
    small = small.resize(size, Image.LANCZOS)
    out = np.asarray(small).astype(np.float32)
    a2 = out[..., 3:4] / 255.0
    rgb = out[..., :3] / np.maximum(a2, 1e-3)
    return to_image(np.concatenate([rgb, out[..., 3:4]], axis=2))


def content_bbox(alpha: np.ndarray, thr: float = 8.0) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(alpha > thr)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def split_wordmark(alpha: np.ndarray, box: tuple[int, int, int, int]) -> tuple[int, int]:
    """Возвращает (низ знака, верх слогана) по самой длинной пустой полосе строк."""
    x0, y0, x1, y1 = box
    rows = (alpha[y0:y1 + 1, x0:x1 + 1] > 8).sum(axis=1)
    empty = rows == 0
    best_start = best_len = -1
    start = None
    for i, flag in enumerate(empty):
        if flag:
            if start is None:
                start = i
        elif start is not None:
            if i - start > best_len:
                best_len, best_start = i - start, start
            start = None
    if start is not None and len(empty) - start > best_len:
        best_len, best_start = len(empty) - start, start
    if best_start < 0:
        raise RuntimeError("не найдена полоса между знаком и слоганом")
    return y0 + best_start - 1, y0 + best_start + best_len


def build_logo(src_name: str, out_name: str) -> None:
    arr = load_rgba(os.path.join(ROOT, src_name))
    alpha = arr[..., 3]
    box = content_bbox(alpha)
    x0, y0, x1, y1 = box
    wordmark_bottom, slogan_top = split_wordmark(alpha, box)
    wordmark_h = wordmark_bottom - y0 + 1
    wordmark_w = x1 - x0 + 1
    print(f"{out_name}: контент {wordmark_w}x{y1 - y0 + 1}, знак {wordmark_w}x{wordmark_h}px, "
          f"слоган с y{slogan_top}")

    crop = to_image(arr[y0:y1 + 1, x0:x1 + 1])
    scale = WORDMARK_W / wordmark_w
    size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    scaled = resize_rgba(crop, size)

    canvas = Image.new("RGBA", (LOGO_BOX[0] * SCALE, LOGO_BOX[1] * SCALE), (0, 0, 0, 0))
    if scaled.width > canvas.width - WORDMARK_POS[0] or \
            scaled.height > canvas.height - WORDMARK_POS[1]:
        raise RuntimeError(f"{out_name}: логотип {scaled.size} не помещается в {canvas.size}")
    canvas.alpha_composite(scaled, WORDMARK_POS)
    out = os.path.join(OUT_BRAND, out_name)
    canvas.save(out)
    print(f"  -> {out_name} {canvas.size} ({os.path.getsize(out) // 1024} KB)")


def build_fingerprint() -> None:
    """Отпечаток из логотипа: без букв и слогана, прозрачный фон, исходный градиент."""
    arr = load_rgba(os.path.join(ROOT, SRC_LIGHT))
    x0, y0, x1, y1 = FINGERPRINT_BOX
    crop = arr[y0:y1, x0:x1]
    # Проверка: в зоне отпечатка не должно быть тёмно-синих букв логотипа.
    solid = crop[..., 3] > 128
    navy = solid & (np.abs(crop[..., 0] - 16) < 34) & (np.abs(crop[..., 1] - 25) < 34) \
        & (np.abs(crop[..., 2] - 84) < 44)
    out = os.path.join(OUT_BRAND, "fincode-fingerprint.webp")
    to_image(crop).save(out, format="WEBP", quality=90, method=6)
    print(f"fincode-fingerprint.webp: {crop.shape[1]}x{crop.shape[0]}, "
          f"пикселей букв в зоне = {int(navy.sum())} "
          f"({os.path.getsize(out) // 1024} KB)")


def render_previews() -> None:
    """Контрольные композиции: отпечаток поверх рабочей области в обеих темах."""
    pw, ph = PREVIEW_WORKSPACE
    dark = Image.new("RGB", (pw, ph), tuple(int(v) for v in BG_WORKSPACE_DARK))
    light = Image.new("RGB", (pw, ph), tuple(int(v) for v in BG_WORKSPACE_LIGHT))

    with Image.open(os.path.join(OUT_BRAND, "fincode-fingerprint.webp")) as im:
        source = im.convert("RGBA")
        decor = resize_rgba(source, (PREVIEW_DECOR_W,
                                     round(source.height * PREVIEW_DECOR_W / source.width)))

        faded = decor.copy()
        faded.putalpha(faded.getchannel("A").point(
            lambda v: int(v * DECOR_OPACITY_DARK)))
        dark.paste(faded, (pw - decor.width, ph - decor.height), faded)

        faded = decor.copy()
        faded.putalpha(faded.getchannel("A").point(
            lambda v: int(v * DECOR_OPACITY_LIGHT)))
        light.paste(faded, (pw - decor.width + 85, ph - decor.height + 125), faded)

    dark.save(os.path.join(OUT_PREVIEW, "workspace-dark.png"))
    light.save(os.path.join(OUT_PREVIEW, "workspace-light.png"))
    for name in ("workspace-dark.png", "workspace-light.png"):
        print(f"  preview: tools/_preview/{name}")


def copy_sources() -> None:
    os.makedirs(OUT_SOURCE, exist_ok=True)
    mapping = {
        SRC_LIGHT: "fincode-logo-light-source.png",
        SRC_DARK: "fincode-logo-dark-source.png",
        SRC_REFERENCE: "fincode-decor-reference.png",
    }
    for src, dst in mapping.items():
        shutil.copyfile(os.path.join(ROOT, src), os.path.join(OUT_SOURCE, dst))
        print(f"source: {src} -> assets/brand/source/{dst}")


def main() -> int:
    for folder in (OUT_BRAND, OUT_SOURCE, OUT_PREVIEW):
        os.makedirs(folder, exist_ok=True)
    copy_sources()
    print()
    build_logo(SRC_LIGHT, "fincode-logo-light.png")
    build_logo(SRC_DARK, "fincode-logo-dark.png")
    build_fingerprint()
    print()
    render_previews()
    return 0


if __name__ == "__main__":
    sys.exit(main())
