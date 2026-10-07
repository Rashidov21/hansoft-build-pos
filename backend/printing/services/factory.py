from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from printing.models import StoreSettings

from .renderers.escpos_renderer import EscposRenderer
from .renderers.tspl_renderer import TsplRenderer


@dataclass(frozen=True)
class PrinterFactory:
    @staticmethod
    def _pick(printer_type: str | None) -> str:
        if printer_type in {StoreSettings.PrinterType.ESC_POS, StoreSettings.PrinterType.TSPL}:
            return str(printer_type)
        return StoreSettings.PrinterType.ESC_POS

    @classmethod
    def get_renderer(cls, *, kind: str, printer_type: str | None):
        picked = cls._pick(printer_type)
        if picked == StoreSettings.PrinterType.ESC_POS:
            return EscposRenderer(kind=kind)
        if picked == StoreSettings.PrinterType.TSPL:
            return TsplRenderer(kind=kind)
        raise ValueError("UNSUPPORTED_PRINTER_TYPE")

    @classmethod
    def render_receipt(cls, *, receipt_dto: dict[str, Any], settings: StoreSettings) -> bytes:
        renderer = cls.get_renderer(kind="receipt", printer_type=settings.receipt_printer_type)
        return renderer.render_receipt(receipt_dto=receipt_dto, settings=settings)

    @classmethod
    def render_label(cls, *, label_payload: dict[str, Any], settings: StoreSettings) -> bytes:
        renderer = cls.get_renderer(kind="label", printer_type=settings.label_printer_type)
        return renderer.render_label(label_payload=label_payload, settings=settings)
