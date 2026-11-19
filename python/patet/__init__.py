"""PATET 0.5 in Python: the board, the parser and the serializer. No dependencies.

    from patet import Board, serialize
    board = Board()
    verdict = board.line("card k1 metric trip 2x2 Days left")  # "ok" | "ok clipped ..." | "err <code> <message>" | "skip"
    serialize(board)                                           # the board as ops
"""

from .core import (
    LIMITS,
    PARTS,
    Board,
    Card,
    Group,
    Item,
    Part,
    Topic,
    asks,
    is_extension_kind,
    kind_names,
    describe,
    MEDIA_KINDS,
    parts_table,
    serialize,
    valid_id,
)
from .lang import (
    VERSION,
    LineStream,
    Reject,
    can_read,
    declared_version,
    header,
    is_blank,
    join_cells,
    parse,
    split_cells,
    strip_bom,
)

__version__ = "0.5.0"

__all__ = [
    "VERSION", "LIMITS", "PARTS", "Part", "Board", "Card", "Group", "Item", "Topic", "Reject", "LineStream",
    "parse", "serialize", "split_cells", "join_cells", "is_blank", "valid_id", "is_extension_kind", "asks",
    "kind_names", "parts_table", "describe", "MEDIA_KINDS", "header", "declared_version", "can_read", "strip_bom",
]
