from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts" / "tax"
sys.path.insert(0, str(SCRIPT_DIR))

from reconcile_local_income_tax import classify, read_excel  # noqa: E402


class ReconcileLocalIncomeTaxRegressionTests(unittest.TestCase):
    def test_fully_unpaid_small_notice_is_unpaid_before_tolerance(self) -> None:
        row = pd.Series({"통보세액": 1_500, "수납세액": 0, "차이금액": -1_500})

        self.assertEqual(classify(row, tolerance=2_000), "미납")

    def test_digit_only_sheet_name_is_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workbook_path = Path(temp_dir) / "notice.xlsx"
            with pd.ExcelWriter(workbook_path, engine="openpyxl") as writer:
                pd.DataFrame({"marker": ["wrong"]}).to_excel(writer, sheet_name="Sheet1", index=False)
                pd.DataFrame({"marker": ["right"]}).to_excel(writer, sheet_name="2026", index=False)

            result = read_excel(workbook_path, "2026")

        self.assertEqual(result.loc[0, "marker"], "right")


if __name__ == "__main__":
    unittest.main()
