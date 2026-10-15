from __future__ import annotations

from decimal import Decimal
from typing import Any


def _tspl_literal(s: str, *, max_len: int) -> str:
    """ASCII-only single-line text safe inside TSPL double-quoted segments."""
    t = (s or "").replace('"', " ").replace("\r", " ").replace("\n", " ").strip()
    if len(t) > max_len:
        t = t[:max_len].rstrip()
    out = t.encode("ascii", errors="ignore").decode("ascii")
    return out if out else "-"


def _tspl_dimensions_mm(size_key: str) -> tuple[int, int]:
    k = (size_key or "40x30").strip().lower()
    if k == "58mm":
        return 58, 40
    if k == "40x50":
        return 40, 50
    if k == "50x40":
        return 50, 40
    if k == "40x30":
        return 40, 30
    if k == "30x20":
        return 30, 20
    return 40, 30


# Per-size layout profiles (dots @ 8 dot/mm). Tuned for XP-365B TSPL built-in fonts.
_SIZE_PROFILES: dict[str, dict[str, Any]] = {
    "30x20": {
        "margin": 2,
        "gap_name_bc": 3,
        "gap_bc_price": 8,
        "gap_bc_hri": 16,
        "name_font": "1",
        "name_char": 8,
        "name_line_h": 12,
        "show_name": True,  # short name; still fits with price
        "price_font": "1",
        "price_char": 8,
        "price_line_h": 14,
        "bc_h_min": 28,
        "bc_h_max_price": 52,
        "bc_h_max_no_price": 78,
        "hri_with_price": 0,
        "hri_without_price": 1,
        "wide_prefs": (2, 1),
        "nar_max": 3,
    },
    "40x30": {
        "margin": 4,
        "gap_name_bc": 6,
        "gap_bc_price": 12,
        "gap_bc_hri": 24,
        "name_font": "1",
        "name_char": 8,
        "name_line_h": 16,
        "show_name": True,
        "price_font": "2",
        "price_char": 12,
        "price_line_h": 20,
        "bc_h_min": 36,
        "bc_h_max_price": 96,
        "bc_h_max_no_price": 120,
        "hri_with_price": 0,
        "hri_without_price": 1,
        "wide_prefs": (3, 2, 1),
        "nar_max": 5,
    },
    "40x50": {
        "margin": 6,
        "gap_name_bc": 8,
        "gap_bc_price": 14,
        "gap_bc_hri": 28,
        "name_font": "2",
        "name_char": 12,
        "name_line_h": 22,
        "show_name": True,
        "price_font": "3",
        "price_char": 16,
        "price_line_h": 26,
        "bc_h_min": 48,
        "bc_h_max_price": 180,
        "bc_h_max_no_price": 220,
        "hri_with_price": 1,
        "hri_without_price": 1,
        "wide_prefs": (3, 2, 1),
        "nar_max": 6,
    },
    "50x40": {
        "margin": 6,
        "gap_name_bc": 8,
        "gap_bc_price": 14,
        "gap_bc_hri": 28,
        "name_font": "2",
        "name_char": 12,
        "name_line_h": 22,
        "show_name": True,
        "price_font": "3",
        "price_char": 16,
        "price_line_h": 26,
        "bc_h_min": 48,
        "bc_h_max_price": 140,
        "bc_h_max_no_price": 180,
        "hri_with_price": 1,
        "hri_without_price": 1,
        "wide_prefs": (3, 2, 1),
        "nar_max": 6,
    },
    "58mm": {
        "margin": 8,
        "gap_name_bc": 10,
        "gap_bc_price": 16,
        "gap_bc_hri": 32,
        "name_font": "3",
        "name_char": 16,
        "name_line_h": 28,
        "show_name": True,
        "price_font": "3",
        "price_char": 16,
        "price_line_h": 28,
        "bc_h_min": 56,
        "bc_h_max_price": 160,
        "bc_h_max_no_price": 200,
        "hri_with_price": 1,
        "hri_without_price": 1,
        "wide_prefs": (3, 2, 1),
        "nar_max": 6,
    },
}


def _normalize_size_key(size_key: str) -> str:
    k = (size_key or "40x30").strip().lower()
    if k in _SIZE_PROFILES:
        return k
    return "40x30"


def _profile_for(size_key: str) -> dict[str, Any]:
    return _SIZE_PROFILES[_normalize_size_key(size_key)]


def _estimate_code128_width_dots(barcode: str, nar: int, wide: int) -> int:
    """
    Conservative width estimate for TSPL CODE128 (narrow nar, wide multiplier wide).
    Over-estimates slightly so centered x leaves margin and avoids clipping.
    """
    L = max(len((barcode or "").strip() or "0"), 1)
    modules = 28 + L * 12
    w_mul = max(1, min(4, int(wide)))
    return int(modules * max(1, nar) * (0.55 + 0.12 * w_mul))


def _text_width_dots(s: str, *, char_dots: int) -> int:
    return max(1, len(s)) * char_dots


def _name_max_chars(*, inner_w: int, char_dots: int) -> int:
    """How many characters fit on one centered line with side margin."""
    return max(4, min(40, inner_w // max(1, char_dots)))


def _price_max_chars(*, inner_w: int, char_dots: int) -> int:
    return max(6, min(28, inner_w // max(1, char_dots)))


def _tspl_layout_from_profile(
    *,
    size_key: str,
    barcode: str,
    has_name: bool,
    has_price: bool,
) -> dict[str, Any]:
    """
    Stack on physical label by size profile:
      [name?] → barcode → [HRI gap or price]
    Elements stay inside SIZE w×h; barcode gets remaining height (capped).
    """
    key = _normalize_size_key(size_key)
    prof = _profile_for(key)
    w_mm, h_mm = _tspl_dimensions_mm(key)
    w_dots = w_mm * 8
    h_dots = h_mm * 8
    margin = int(prof["margin"])
    inner_w = max(16, w_dots - 2 * margin)
    inner_h = max(24, h_dots - 2 * margin)

    use_name = bool(has_name and prof.get("show_name", True))
    hri = int(prof["hri_with_price"] if has_price else prof["hri_without_price"])

    name_line_h = int(prof["name_line_h"]) if use_name else 0
    gap_name_bc = int(prof["gap_name_bc"]) if use_name else 0
    price_line_h = int(prof["price_line_h"]) if has_price else 0
    # After bars: price band, or HRI digits band when human-readable is on.
    if has_price:
        gap_after_bc = int(prof["gap_bc_price"])
    elif hri:
        gap_after_bc = int(prof["gap_bc_hri"])
    else:
        gap_after_bc = 4

    reserved_top = name_line_h + gap_name_bc
    reserved_bottom = gap_after_bc + price_line_h
    bc_h = inner_h - reserved_top - reserved_bottom
    bc_h_max = int(prof["bc_h_max_price"] if has_price else prof["bc_h_max_no_price"])
    bc_h_min = int(prof["bc_h_min"])
    bc_h = max(bc_h_min, min(bc_h, bc_h_max))

    # If stack still overflows (extreme), shrink barcode further.
    stack_h = reserved_top + bc_h + reserved_bottom
    if stack_h > inner_h:
        bc_h = max(bc_h_min, inner_h - reserved_top - reserved_bottom)
        stack_h = reserved_top + bc_h + reserved_bottom

    wide_prefs = tuple(prof["wide_prefs"])
    nar_max = int(prof["nar_max"])
    best_nar, best_wide = 1, wide_prefs[-1] if wide_prefs else 1
    for wide in wide_prefs:
        for nar in range(nar_max, 0, -1):
            if _estimate_code128_width_dots(barcode, nar, wide) <= inner_w:
                best_nar, best_wide = nar, wide
                break
        if _estimate_code128_width_dots(barcode, best_nar, best_wide) <= inner_w:
            break

    bc_w_est = _estimate_code128_width_dots(barcode, best_nar, best_wide)
    x_bc = margin + max(0, (inner_w - bc_w_est) // 2)

    y0 = margin + max(0, (inner_h - stack_h) // 2)
    if use_name:
        y_sc = y0
        y_bc = y_sc + name_line_h + gap_name_bc
    else:
        y_sc = 0
        y_bc = y0

    y_price = (y_bc + bc_h + gap_after_bc) if has_price else 0
    # Clamp price inside label (safety).
    if has_price and y_price + price_line_h > h_dots - margin:
        y_price = max(margin, h_dots - margin - price_line_h)

    return {
        "size_key": key,
        "w_mm": w_mm,
        "h_mm": h_mm,
        "w_dots": w_dots,
        "h_dots": h_dots,
        "margin": margin,
        "inner_w": inner_w,
        "sc_font": str(prof["name_font"]),
        "sc_xmul": 1,
        "sc_ymul": 1,
        "sc_char": int(prof["name_char"]),
        "y_sc": y_sc,
        "name_max": _name_max_chars(inner_w=inner_w, char_dots=int(prof["name_char"])),
        "price_font": str(prof["price_font"]),
        "price_xmul": 1,
        "price_ymul": 1,
        "price_char": int(prof["price_char"]),
        "price_max": _price_max_chars(inner_w=inner_w, char_dots=int(prof["price_char"])),
        "y_price": y_price,
        "x_bc": x_bc,
        "y_bc": y_bc,
        "bc_h": bc_h,
        "nar": best_nar,
        "wide": best_wide,
        "use_name": use_name,
        "hri": hri,
    }


def _tspl_layout_centered(
    *,
    w_mm: int,
    h_mm: int,
    barcode: str,
    has_name: bool = True,
    has_price: bool = True,
) -> dict[str, Any]:
    """Backward-compatible wrapper — prefer size_key via render_label profiles."""
    # Map mm back to a known key when possible.
    size_key = "40x30"
    for key, (ww, hh) in (
        ("30x20", (30, 20)),
        ("40x30", (40, 30)),
        ("40x50", (40, 50)),
        ("50x40", (50, 40)),
        ("58mm", (58, 40)),
    ):
        if ww == w_mm and hh == h_mm:
            size_key = key
            break
    return _tspl_layout_from_profile(
        size_key=size_key,
        barcode=barcode,
        has_name=has_name,
        has_price=has_price,
    )


class TsplRenderer:
    def __init__(self, *, kind: str):
        self.kind = kind

    def _money(self, value: Any) -> str:
        return f"{Decimal(str(value)).quantize(Decimal('1')):,}".replace(",", " ")

    def render_receipt(self, *, receipt_dto: dict[str, Any], settings) -> bytes:
        # Fallback for unsupported receipt TSPL: emit plain text bytes.
        lines = [
            settings.brand_name,
            str(receipt_dto.get("sale_id", "")),
            self._money(receipt_dto.get("grand_total", 0)),
        ]
        return ("\n".join(lines) + "\n").encode("utf-8", errors="ignore")

    def render_label(self, *, label_payload: dict[str, Any], settings) -> bytes:
        from printing.receipt import (
            _label_custom_name,
            _label_sell_price,
            label_currency_suffix,
            prepare_tspl_label_text,
            resolve_label_show_price,
            resolve_receipt_store_lang,
        )

        variant = label_payload["variant"]
        size_key = _normalize_size_key(label_payload.get("size") or "40x30")
        copies = max(1, min(200, int(label_payload.get("copies") or 1)))
        print_price = resolve_label_show_price(
            variant, settings, label_payload.get("show_price")
        )

        barcode = (variant.barcode or "").strip()
        if not barcode:
            raise ValueError("Label barcode is required")

        store_lang = resolve_receipt_store_lang(settings, None)
        raw_custom = _label_custom_name(variant.product, store_lang)

        # Provisional layout for name_max / price_max from physical width.
        lay0 = _tspl_layout_from_profile(
            size_key=size_key,
            barcode=barcode,
            has_name=True,
            has_price=bool(print_price),
        )
        custom = prepare_tspl_label_text(raw_custom, max_len=int(lay0["name_max"]))
        has_name = bool(custom and custom != "-")

        sell = _label_sell_price(variant)
        price = ""
        if print_price and sell is not None:
            suffix = label_currency_suffix(store_lang, ascii_only=True)
            price = _tspl_literal(
                f"{self._money(sell)}{suffix}",
                max_len=int(lay0["price_max"]),
            )
        has_price = bool(print_price and price)

        lay = _tspl_layout_from_profile(
            size_key=size_key,
            barcode=barcode,
            has_name=has_name,
            has_price=has_price,
        )
        # Re-truncate if profile name_max changed (e.g. after has_name resolved).
        if has_name and len(custom) > int(lay["name_max"]):
            custom = prepare_tspl_label_text(raw_custom, max_len=int(lay["name_max"]))
            has_name = bool(custom and custom != "-")
            lay = _tspl_layout_from_profile(
                size_key=size_key,
                barcode=barcode,
                has_name=has_name,
                has_price=has_price,
            )

        w_mm, h_mm = lay["w_mm"], lay["h_mm"]
        w_dots = lay["w_dots"]
        use_name = bool(lay.get("use_name")) and has_name
        hri = int(lay["hri"])

        x_custom = (
            max(lay["margin"], (w_dots - _text_width_dots(custom, char_dots=lay["sc_char"])) // 2)
            if use_name and custom and custom != "-"
            else 0
        )
        x_price = (
            max(
                lay["margin"],
                (w_dots - _text_width_dots(price, char_dots=lay["price_char"])) // 2,
            )
            if has_price and price
            else 0
        )

        try:
            gap_mm = float(getattr(settings, "label_gap_mm", 2) or 2)
        except (TypeError, ValueError):
            gap_mm = 2.0
        gap_mm = max(0.5, min(20.0, gap_mm))
        try:
            direction = int(getattr(settings, "label_direction", 1) or 1)
        except (TypeError, ValueError):
            direction = 1
        if direction not in (0, 1):
            direction = 1
        gap_cmd = f"GAP {gap_mm:g} mm,0 mm"
        header = [
            f"SIZE {w_mm} mm,{h_mm} mm",
            gap_cmd,
            f"DIRECTION {direction}",
        ]
        blocks: list[str] = []
        for _ in range(copies):
            block = ["CLS"]
            if use_name and custom and custom != "-":
                block.append(
                    f'TEXT {x_custom},{lay["y_sc"]},"{lay["sc_font"]}",0,'
                    f'{lay["sc_xmul"]},{lay["sc_ymul"]},"{custom}"'
                )
            block.append(
                f'BARCODE {lay["x_bc"]},{lay["y_bc"]},"128",{lay["bc_h"]},'
                f'{hri},0,{lay["nar"]},{lay["wide"]},"{barcode}"'
            )
            if has_price and price:
                block.append(
                    f'TEXT {x_price},{lay["y_price"]},"{lay["price_font"]}",0,'
                    f'{lay["price_xmul"]},{lay["price_ymul"]},"{price}"'
                )
            block.extend(["PRINT 1,1"])
            blocks.extend(block)

        tspl = header + blocks
        return ("\r\n".join(tspl) + "\r\n").encode("ascii", errors="ignore")
