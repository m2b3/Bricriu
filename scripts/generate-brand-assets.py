"""Generate Bricriu's selected wordmark and squaremark assets.

The Segotia wordmark is exported as paths and pixels. The Gadelica squaremark
is deliberately pixels only: the font is rendered without modification and the
font file is not copied into the application or repository.
"""

from __future__ import annotations

import argparse
from html import escape
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont


BRAND_DARK = "#173f34"
BRAND = "#1f5d49"
CREAM = "#fffaf0"


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--segotia", required=True, type=Path)
    parser.add_argument("--gadelica", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/brand"))
    return parser.parse_args()


def value_x_advance(value: object | None) -> int:
    return int(getattr(value, "XAdvance", 0) or 0)


def pair_adjustment(subtable: object, left: str, right: str) -> int:
    coverage = getattr(getattr(subtable, "Coverage", None), "glyphs", [])
    if left not in coverage:
        return 0

    format_number = getattr(subtable, "Format", 0)
    if format_number == 1:
        pair_set = subtable.PairSet[coverage.index(left)]
        for record in pair_set.PairValueRecord:
            if record.SecondGlyph == right:
                return value_x_advance(record.Value1) + value_x_advance(record.Value2)
        return 0

    if format_number == 2:
        left_class = subtable.ClassDef1.classDefs.get(left, 0)
        right_class = subtable.ClassDef2.classDefs.get(right, 0)
        record = subtable.Class1Record[left_class].Class2Record[right_class]
        return value_x_advance(record.Value1) + value_x_advance(record.Value2)

    return 0


def kerning_lookups(font: TTFont) -> list[int]:
    if "GPOS" not in font:
        return []
    feature_list = font["GPOS"].table.FeatureList
    if feature_list is None:
        return []
    indices: list[int] = []
    for record in feature_list.FeatureRecord:
        if record.FeatureTag != "kern":
            continue
        for index in record.Feature.LookupListIndex:
            if index not in indices:
                indices.append(index)
    return indices


def kerning(font: TTFont, left: str, right: str, lookups: list[int]) -> int:
    lookup_list = font["GPOS"].table.LookupList.Lookup
    total = 0
    for index in lookups:
        lookup = lookup_list[index]
        if lookup.LookupType != 2:
            continue
        total += sum(pair_adjustment(subtable, left, right) for subtable in lookup.SubTable)
    return total


def write_wordmark_svg(font_path: Path, output_path: Path) -> None:
    text = "Bricriu"
    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap() or {}
    glyph_names = [cmap[ord(character)] for character in text]
    metrics = font["hmtx"].metrics
    lookups = kerning_lookups(font)

    positions: list[int] = []
    cursor = 0
    for index, glyph_name in enumerate(glyph_names):
        positions.append(cursor)
        cursor += metrics[glyph_name][0]
        if index + 1 < len(glyph_names):
            cursor += kerning(font, glyph_name, glyph_names[index + 1], lookups)

    paths: list[str] = []
    bounds: list[tuple[float, float, float, float]] = []
    for glyph_name, x_position in zip(glyph_names, positions):
        path_pen = SVGPathPen(glyph_set)
        glyph_set[glyph_name].draw(TransformPen(path_pen, (1, 0, 0, -1, x_position, 0)))
        commands = path_pen.getCommands()
        if commands:
            paths.append(f'    <path d="{escape(commands)}"/>')

        bounds_pen = BoundsPen(glyph_set)
        glyph_set[glyph_name].draw(bounds_pen)
        if bounds_pen.bounds:
            x_min, y_min, x_max, y_max = bounds_pen.bounds
            bounds.append((x_min + x_position, -y_max, x_max + x_position, -y_min))

    min_x = min(bound[0] for bound in bounds)
    min_y = min(bound[1] for bound in bounds)
    max_x = max(bound[2] for bound in bounds)
    max_y = max(bound[3] for bound in bounds)
    padding = 70
    view_x = min_x - padding
    view_y = min_y - padding
    view_width = max_x - min_x + padding * 2
    view_height = max_y - min_y + padding * 2

    svg = "\n".join(
        [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title description"',
            f'     viewBox="{view_x:g} {view_y:g} {view_width:g} {view_height:g}">',
            "  <title id=\"title\">Bricriu</title>",
            "  <description id=\"description\">Bricriu wordmark rendered in Segotia</description>",
            "  <metadata>",
            "    Typeface: Segotia 1.005 by Dominic Stanley, SIL Open Font License 1.1.",
            "    Reserved Font Name: Segotia. The font file is not embedded in this SVG.",
            "  </metadata>",
            f'  <g fill="{BRAND_DARK}">',
            *paths,
            "  </g>",
            "</svg>",
            "",
        ]
    )
    output_path.write_text(svg, encoding="utf-8", newline="\n")


def fitted_font(
    draw: ImageDraw.ImageDraw,
    font_path: Path,
    text: str,
    starting_size: int,
    max_width: int,
    max_height: int,
) -> ImageFont.FreeTypeFont:
    size = starting_size
    while size > 16:
        font = ImageFont.truetype(
            str(font_path),
            size=size,
            layout_engine=ImageFont.Layout.RAQM,
        )
        left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
        if right - left <= max_width and bottom - top <= max_height:
            return font
        size -= 2
    raise RuntimeError(f"Could not fit {text!r} using {font_path}")


def centered_position(
    draw: ImageDraw.ImageDraw,
    area: tuple[int, int, int, int],
    text: str,
    font: ImageFont.ImageFont,
) -> tuple[float, float]:
    left, top, right, bottom = area
    text_left, text_top, text_right, text_bottom = draw.textbbox((0, 0), text, font=font)
    width = text_right - text_left
    height = text_bottom - text_top
    return (
        left + (right - left - width) / 2 - text_left,
        top + (bottom - top - height) / 2 - text_top,
    )


def write_wordmark_png(font_path: Path, output_path: Path) -> None:
    scratch = Image.new("RGBA", (2000, 600), (0, 0, 0, 0))
    draw = ImageDraw.Draw(scratch)
    font = ImageFont.truetype(
        str(font_path),
        size=340,
        layout_engine=ImageFont.Layout.RAQM,
    )
    left, top, right, bottom = draw.textbbox((0, 0), "Bricriu", font=font)
    padding = 54
    image = Image.new(
        "RGBA",
        (right - left + padding * 2, bottom - top + padding * 2),
        (0, 0, 0, 0),
    )
    image_draw = ImageDraw.Draw(image)
    image_draw.text(
        (padding - left, padding - top),
        "Bricriu",
        font=font,
        fill=BRAND_DARK,
    )
    image.save(output_path, format="PNG", optimize=True)


def write_squaremark_png(font_path: Path, output_path: Path) -> None:
    image = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((48, 48, 976, 976), radius=208, fill=BRAND)
    font = fitted_font(draw, font_path, "B", 720, 570, 660)
    position = centered_position(draw, (190, 164, 834, 842), "B", font)
    draw.text(position, "B", font=font, fill=CREAM)
    image.save(output_path, format="PNG", optimize=True)


def main() -> None:
    args = arguments()
    args.output.mkdir(parents=True, exist_ok=True)
    write_wordmark_svg(args.segotia, args.output / "bricriu-wordmark.svg")
    write_wordmark_png(args.segotia, args.output / "bricriu-wordmark.png")
    write_squaremark_png(args.gadelica, args.output / "bricriu-squaremark.png")


if __name__ == "__main__":
    main()
