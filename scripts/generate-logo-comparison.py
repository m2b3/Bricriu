"""Generate the Bricriu wordmark/squaremark comparison sheet.

The script never embeds font files in its output. It renders a static PNG from
font files supplied in a local working directory. The expected directory is the
temporary `_brand-work` tree used while evaluating the typefaces.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


CANVAS_WIDTH = 2200
MARGIN_X = 92
TOP = 252
ROW_HEIGHT = 194
ROW_GAP = 18
LABEL_WIDTH = 500
WORDMARK_WIDTH = 1010
SQUAREMARK_WIDTH = 320
CARD_HEIGHT = 158

PAPER = "#f3efe6"
PANEL = "#fffdf8"
INK = "#24332e"
MUTED = "#69736e"
FAINT = "#958f84"
LINE = "#d8d1c4"
BRAND = "#1f5d49"
BRAND_DARK = "#173f34"
CREAM = "#fffaf0"
OPEN_BG = "#dfeee7"
OPEN_FG = "#235d47"
LIMITED_BG = "#f3e5bd"
LIMITED_FG = "#765a15"
RESTRICTED_BG = "#eedad4"
RESTRICTED_FG = "#84493c"
UNUSABLE_BG = "#e7e3dc"
UNUSABLE_FG = "#6f685e"


@dataclass(frozen=True)
class Candidate:
    title: str
    detail: str
    licence: str
    licence_kind: str
    font_path: Path | None
    features: tuple[str, ...] = ()
    unavailable: str | None = None


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--font-dir", type=Path, default=Path("_brand-work"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("docs/brand/bricriu-logo-comparison.png"),
    )
    return parser.parse_args()


def find_font(root: Path, filename: str) -> Path:
    matches = [
        path
        for path in root.rglob(filename)
        if "__MACOSX" not in path.parts and not path.name.startswith("._")
    ]
    if len(matches) != 1:
        raise RuntimeError(f"Expected exactly one {filename!r} under {root}, found {matches}")
    return matches[0]


def ui_font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    names = (
        ["C:/Windows/Fonts/seguisb.ttf", "C:/Windows/Fonts/segoeuib.ttf"]
        if bold
        else ["C:/Windows/Fonts/segoeui.ttf"]
    )
    names.extend(
        [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
            if bold
            else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
            if bold
            else "/System/Library/Fonts/Supplemental/Arial.ttf",
        ]
    )
    for name in names:
        if Path(name).exists():
            return ImageFont.truetype(name, size=size)
    return ImageFont.load_default(size=size)


def fit_font(
    draw: ImageDraw.ImageDraw,
    path: Path,
    text: str,
    max_width: int,
    max_height: int,
    features: tuple[str, ...],
    starting_size: int,
) -> ImageFont.FreeTypeFont:
    size = starting_size
    while size > 24:
        font = ImageFont.truetype(
            str(path),
            size=size,
            layout_engine=ImageFont.Layout.RAQM,
        )
        box = draw.textbbox((0, 0), text, font=font, features=list(features))
        if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
            return font
        size -= 2
    raise RuntimeError(f"Could not fit {text!r} using {path}")


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    area: tuple[int, int, int, int],
    text: str,
    font: ImageFont.ImageFont,
    fill: str,
    *,
    features: tuple[str, ...] = (),
) -> None:
    left, top, right, bottom = area
    box = draw.textbbox((0, 0), text, font=font, features=list(features))
    width = box[2] - box[0]
    height = box[3] - box[1]
    x = left + (right - left - width) / 2 - box[0]
    y = top + (bottom - top - height) / 2 - box[1]
    draw.text((x, y), text, font=font, fill=fill, features=list(features))


def draw_chip(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    text: str,
    kind: str,
    font: ImageFont.ImageFont,
) -> None:
    colours = {
        "open": (OPEN_BG, OPEN_FG),
        "limited": (LIMITED_BG, LIMITED_FG),
        "restricted": (RESTRICTED_BG, RESTRICTED_FG),
        "unusable": (UNUSABLE_BG, UNUSABLE_FG),
    }
    background, foreground = colours[kind]
    box = draw.textbbox((0, 0), text, font=font)
    width = box[2] - box[0] + 26
    height = 34
    draw.rounded_rectangle((x, y, x + width, y + height), radius=17, fill=background)
    draw.text((x + 13, y + 6), text, font=font, fill=foreground)


def candidates(font_root: Path) -> list[Candidate]:
    bunchlo = find_font(font_root, "bungc.otf")
    bunchlo_bold = find_font(font_root, "buntgc.otf")
    gadelica = find_font(font_root, "Gadelica.otf")
    gadelica_heavy = find_font(font_root, "Gadelica-Gravis.otf")
    segotia = find_font(font_root, "Segotia-Regular.otf")
    cianchlo = find_font(font_root, "cianchlo.otf")
    return [
        Candidate(
            "Bunchló GC",
            "Regular · default forms",
            "Gaelchló terms",
            "restricted",
            bunchlo,
        ),
        Candidate(
            "Bunchló GC",
            "Regular · historic B + r (ss03)",
            "Gaelchló terms",
            "restricted",
            bunchlo,
            ("ss03",),
        ),
        Candidate(
            "Bunchló Trom GC",
            "Bold · historic B + r (ss03)",
            "Gaelchló terms",
            "restricted",
            bunchlo_bold,
            ("ss03",),
        ),
        Candidate(
            "Gadelica",
            "Regular · unmodified rendering",
            "Redistributable; no modification",
            "limited",
            gadelica,
        ),
        Candidate(
            "Gadelica Gravis",
            "Heavy · unmodified rendering",
            "Redistributable; no modification",
            "limited",
            gadelica_heavy,
        ),
        Candidate(
            "Segotia",
            "Regular · default forms",
            "SIL OFL 1.1",
            "open",
            segotia,
        ),
        Candidate(
            "Segotia",
            "Regular · alternate forms (ss01)",
            "SIL OFL 1.1",
            "open",
            segotia,
            ("ss01",),
        ),
        Candidate(
            "Cianchló",
            "Regular · default forms",
            "SIL OFL 1.1",
            "open",
            cianchlo,
        ),
        Candidate(
            "Cianchló",
            "Regular · alternate B (ss01)",
            "SIL OFL 1.1",
            "open",
            cianchlo,
            ("ss01",),
        ),
        Candidate(
            "Gaedhilge",
            "Published source is incomplete",
            "SIL OFL 1.1 · unusable here",
            "unusable",
            None,
            unavailable="Only lowercase a–d exist; neither ‘Bricriu’ nor capital ‘B’ can be rendered.",
        ),
    ]


def generate(font_root: Path, output: Path) -> None:
    rows = candidates(font_root)
    footer_height = 214
    canvas_height = TOP + len(rows) * (ROW_HEIGHT + ROW_GAP) + footer_height
    image = Image.new("RGB", (CANVAS_WIDTH, canvas_height), PAPER)
    draw = ImageDraw.Draw(image)

    title_font = ui_font(58, bold=True)
    subtitle_font = ui_font(27)
    column_font = ui_font(22, bold=True)
    name_font = ui_font(27, bold=True)
    detail_font = ui_font(20)
    chip_font = ui_font(16, bold=True)
    unavailable_font = ui_font(22, bold=True)
    unavailable_detail_font = ui_font(18)
    footer_font = ui_font(18)

    draw.text((MARGIN_X, 60), "Bricriu logo comparison", font=title_font, fill=INK)
    draw.text(
        (MARGIN_X, 132),
        "The same lettering tested as a horizontal wordmark and a real 1:1 application mark.",
        font=subtitle_font,
        fill=MUTED,
    )

    label_x = MARGIN_X
    word_x = MARGIN_X + LABEL_WIDTH
    square_x = word_x + WORDMARK_WIDTH + 34
    draw.text((label_x, 207), "TYPEFACE / SETTING", font=column_font, fill=MUTED)
    draw.text((word_x + 18, 207), "WORDMARK", font=column_font, fill=MUTED)
    draw.text((square_x + 18, 207), "SQUAREMARK", font=column_font, fill=MUTED)

    for index, candidate in enumerate(rows):
        y = TOP + index * (ROW_HEIGHT + ROW_GAP)
        card_top = y + 8
        card_bottom = card_top + CARD_HEIGHT

        draw.text((label_x, y + 22), candidate.title, font=name_font, fill=INK)
        draw.text((label_x, y + 62), candidate.detail, font=detail_font, fill=MUTED)
        draw_chip(draw, label_x, y + 101, candidate.licence, candidate.licence_kind, chip_font)

        draw.rounded_rectangle(
            (word_x, card_top, word_x + WORDMARK_WIDTH, card_bottom),
            radius=22,
            fill=PANEL,
            outline=LINE,
            width=2,
        )
        draw.rounded_rectangle(
            (square_x, card_top, square_x + SQUAREMARK_WIDTH, card_bottom),
            radius=22,
            fill=PANEL,
            outline=LINE,
            width=2,
        )

        if candidate.unavailable:
            draw.text(
                (word_x + 34, card_top + 42),
                "Cannot render the requested wordmark",
                font=unavailable_font,
                fill=UNUSABLE_FG,
            )
            draw.text(
                (word_x + 34, card_top + 82),
                candidate.unavailable,
                font=unavailable_detail_font,
                fill=FAINT,
            )
            icon_left = square_x + (SQUAREMARK_WIDTH - 126) // 2
            icon_top = card_top + (CARD_HEIGHT - 126) // 2
            draw.rounded_rectangle(
                (icon_left, icon_top, icon_left + 126, icon_top + 126),
                radius=29,
                fill="#e8e4dc",
            )
            draw.line(
                (icon_left + 34, icon_top + 34, icon_left + 92, icon_top + 92),
                fill=FAINT,
                width=9,
            )
            draw.line(
                (icon_left + 92, icon_top + 34, icon_left + 34, icon_top + 92),
                fill=FAINT,
                width=9,
            )
            continue

        assert candidate.font_path is not None
        word_font = fit_font(
            draw,
            candidate.font_path,
            "Bricriu",
            WORDMARK_WIDTH - 90,
            CARD_HEIGHT - 50,
            candidate.features,
            126,
        )
        draw_centered_text(
            draw,
            (word_x + 34, card_top + 12, word_x + WORDMARK_WIDTH - 34, card_bottom - 12),
            "Bricriu",
            word_font,
            BRAND_DARK,
            features=candidate.features,
        )

        icon_size = 126
        icon_left = square_x + (SQUAREMARK_WIDTH - icon_size) // 2
        icon_top = card_top + (CARD_HEIGHT - icon_size) // 2
        draw.rounded_rectangle(
            (icon_left, icon_top, icon_left + icon_size, icon_top + icon_size),
            radius=29,
            fill=BRAND,
        )
        icon_font = fit_font(
            draw,
            candidate.font_path,
            "B",
            86,
            90,
            candidate.features,
            102,
        )
        draw_centered_text(
            draw,
            (icon_left + 14, icon_top + 12, icon_left + icon_size - 14, icon_top + icon_size - 12),
            "B",
            icon_font,
            CREAM,
            features=candidate.features,
        )

    footer_y = TOP + len(rows) * (ROW_HEIGHT + ROW_GAP) + 35
    draw.line((MARGIN_X, footer_y - 28, CANVAS_WIDTH - MARGIN_X, footer_y - 28), fill=LINE, width=2)
    draw.text(
        (MARGIN_X, footer_y),
        "Comparison only — no font files are embedded. Open candidates: Segotia and Cianchló. Gaedhilge is open but incomplete.",
        font=footer_font,
        fill=MUTED,
    )
    draw.text(
        (MARGIN_X, footer_y + 36),
        "Bunchló and Gadelica samples are static renderings from unmodified official font files. Final asset licensing depends on the selection.",
        font=footer_font,
        fill=MUTED,
    )
    draw.text(
        (MARGIN_X, footer_y + 72),
        "Colours and frames are held constant so the letterforms—not presentation differences—drive the decision.",
        font=footer_font,
        fill=MUTED,
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True)


if __name__ == "__main__":
    args = arguments()
    generate(args.font_dir, args.output)
