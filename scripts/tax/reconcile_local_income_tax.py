#!/usr/bin/env python3
"""양도소득분 지방소득세 수납 대사 스크립트.

국세청 통보자료 엑셀과 지방세정보시스템 수납자료 엑셀을 납세자별로 합산해
정상/미납/과소/환급 판정 결과를 엑셀 파일로 저장한다.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Iterable

import pandas as pd

DEFAULT_TOLERANCE = 2_000
KEYWORDS = {
    "taxpayer_id": ["주민등록번호", "법인등록번호", "사업자등록번호", "납세자번호", "관리번호", "납세자ID", "납세자식별번호"],
    "taxpayer_name": ["납세자명", "성명", "상호", "이름"],
    "notice_amount": ["지방소득세", "지방소득세액", "양도소득분", "납부할세액", "결정세액", "통보세액", "세액"],
    "paid_amount": ["수납액", "납부액", "납입액", "납부세액", "수납금액", "지방소득세", "세액"],
}


def normalize_column_name(value: object) -> str:
    """공백과 특수문자를 줄여 컬럼명 비교가 쉽도록 정규화한다."""
    return re.sub(r"[^0-9A-Za-z가-힣]", "", str(value or "")).lower()


def normalize_identifier(value: object) -> str:
    """납세자 식별번호에서 하이픈/공백을 제거하고 숫자형 .0 꼬리를 정리한다."""
    if pd.isna(value):
        return ""
    text = str(value).strip()
    if re.fullmatch(r"\d+\.0", text):
        text = text[:-2]
    return re.sub(r"[^0-9A-Za-z가-힣]", "", text)


def to_number(value: object) -> float:
    """쉼표, 원 기호, 공백이 섞인 문자형 숫자를 안전하게 숫자로 변환한다."""
    if pd.isna(value) or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    is_parenthesized_negative = text.startswith("(") and text.endswith(")")
    cleaned = re.sub(r"[^0-9.\-]", "", text)
    if cleaned in {"", "-", ".", "-."}:
        return 0.0
    number = float(cleaned)
    return -abs(number) if is_parenthesized_negative else number


def find_column(columns: Iterable[object], keywords: list[str], explicit: str | None = None) -> str:
    """명시 컬럼 또는 키워드 기반으로 실제 컬럼명을 찾는다."""
    column_list = list(columns)
    if explicit:
        if explicit in column_list:
            return explicit
        normalized_explicit = normalize_column_name(explicit)
        for column in column_list:
            if normalize_column_name(column) == normalized_explicit:
                return str(column)
        raise ValueError(f"지정한 컬럼을 찾을 수 없습니다: {explicit}")

    normalized_keywords = [normalize_column_name(keyword) for keyword in keywords]
    for column in column_list:
        normalized_column = normalize_column_name(column)
        if any(keyword in normalized_column for keyword in normalized_keywords):
            return str(column)
    raise ValueError(f"다음 키워드 중 하나를 포함한 컬럼을 찾을 수 없습니다: {', '.join(keywords)}")


def read_excel(path: Path, sheet: str | int | None) -> pd.DataFrame:
    """엑셀 파일을 문자열 우선으로 읽어 원본 식별번호 손실을 줄인다."""
    if not path.exists():
        raise FileNotFoundError(f"파일이 없습니다: {path}")
    selected_sheet: str | int = sheet if sheet is not None else 0
    if isinstance(selected_sheet, str) and selected_sheet.isdigit():
        with pd.ExcelFile(path) as workbook:
            if selected_sheet not in workbook.sheet_names:
                selected_sheet = int(selected_sheet)
    return pd.read_excel(path, sheet_name=selected_sheet, dtype=str)


def prepare_notice(df: pd.DataFrame, args: argparse.Namespace) -> pd.DataFrame:
    id_col = find_column(df.columns, KEYWORDS["taxpayer_id"], args.notice_id_col)
    name_col = find_column(df.columns, KEYWORDS["taxpayer_name"], args.notice_name_col)
    amount_col = find_column(df.columns, KEYWORDS["notice_amount"], args.notice_amount_col)
    prepared = df.copy()
    prepared["납세자식별번호"] = prepared[id_col].map(normalize_identifier)
    prepared["납세자명"] = prepared[name_col].fillna("").astype(str).str.strip()
    prepared["통보세액"] = prepared[amount_col].map(to_number)
    return prepared.groupby(["납세자식별번호", "납세자명"], dropna=False, as_index=False)["통보세액"].sum()


def prepare_payment(df: pd.DataFrame, args: argparse.Namespace) -> pd.DataFrame:
    id_col = find_column(df.columns, KEYWORDS["taxpayer_id"], args.payment_id_col)
    name_col = find_column(df.columns, KEYWORDS["taxpayer_name"], args.payment_name_col)
    amount_col = find_column(df.columns, KEYWORDS["paid_amount"], args.payment_amount_col)
    prepared = df.copy()
    prepared["납세자식별번호"] = prepared[id_col].map(normalize_identifier)
    prepared["납세자명"] = prepared[name_col].fillna("").astype(str).str.strip()
    prepared["수납세액"] = prepared[amount_col].map(to_number)
    return prepared.groupby(["납세자식별번호", "납세자명"], dropna=False, as_index=False)["수납세액"].sum()


def classify(row: pd.Series, tolerance: int) -> str:
    diff = row["차이금액"]
    notice = row["통보세액"]
    paid = row["수납세액"]
    if notice > 0 and paid == 0:
        return "미납"
    if abs(diff) <= tolerance:
        return "정상"
    if diff < -tolerance:
        return "과소"
    if diff > tolerance:
        return "환급"
    return "확인필요"


def reconcile(args: argparse.Namespace) -> pd.DataFrame:
    notice = prepare_notice(read_excel(Path(args.notice), args.notice_sheet), args)
    payment = prepare_payment(read_excel(Path(args.payment), args.payment_sheet), args)
    merged = notice.merge(payment, on=["납세자식별번호", "납세자명"], how="outer")
    merged[["통보세액", "수납세액"]] = merged[["통보세액", "수납세액"]].fillna(0)
    merged["차이금액"] = merged["수납세액"] - merged["통보세액"]
    merged["판정"] = merged.apply(classify, axis=1, tolerance=args.tolerance)
    merged["확인메모"] = merged["판정"].map({
        "정상": f"차이금액이 ±{args.tolerance:,}원 이내입니다.",
        "미납": "통보세액은 있으나 수납세액이 없습니다.",
        "과소": "수납세액이 통보세액보다 부족합니다.",
        "환급": "수납세액이 통보세액보다 많습니다.",
    }).fillna("수기 확인이 필요합니다.")
    return merged.sort_values(["판정", "납세자명", "납세자식별번호"]).reset_index(drop=True)


def write_output(result: pd.DataFrame, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        result.to_excel(writer, sheet_name="전체결과", index=False)
        for status, group in result.groupby("판정"):
            safe_status = re.sub(r"[\\/*?:\[\]]", "_", status)[:31]
            group.to_excel(writer, sheet_name=safe_status, index=False)
        summary = result.groupby("판정", as_index=False).agg(건수=("판정", "size"), 통보세액합계=("통보세액", "sum"), 수납세액합계=("수납세액", "sum"), 차이금액합계=("차이금액", "sum"))
        summary.to_excel(writer, sheet_name="요약", index=False)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="국세청 통보자료와 지방세정보시스템 수납자료를 대사해 판정 엑셀을 생성합니다.")
    parser.add_argument("--notice", required=True, help="국세청 통보자료 엑셀 경로")
    parser.add_argument("--payment", required=True, help="지방세정보시스템 수납자료 엑셀 경로")
    parser.add_argument("--output", default="output/양도소득분_지방소득세_대사결과.xlsx", help="결과 엑셀 경로")
    parser.add_argument("--tolerance", type=int, default=DEFAULT_TOLERANCE, help="정상 처리할 허용 차이 금액")
    parser.add_argument("--notice-sheet", default=None, help="통보자료 시트명 또는 0부터 시작하는 번호")
    parser.add_argument("--payment-sheet", default=None, help="수납자료 시트명 또는 0부터 시작하는 번호")
    parser.add_argument("--notice-id-col", default=None, help="통보자료 납세자 식별번호 컬럼명")
    parser.add_argument("--notice-name-col", default=None, help="통보자료 납세자명 컬럼명")
    parser.add_argument("--notice-amount-col", default=None, help="통보자료 세액 컬럼명")
    parser.add_argument("--payment-id-col", default=None, help="수납자료 납세자 식별번호 컬럼명")
    parser.add_argument("--payment-name-col", default=None, help="수납자료 납세자명 컬럼명")
    parser.add_argument("--payment-amount-col", default=None, help="수납자료 수납액 컬럼명")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        result = reconcile(args)
        write_output(result, Path(args.output))
    except Exception as exc:  # CLI 오류 메시지를 사용자 친화적으로 표시
        print(f"오류: {exc}", file=sys.stderr)
        return 1
    print(f"완료: {args.output} ({len(result):,}건)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
