#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _ensure_pypandoc() -> None:
    try:
        import pypandoc  # noqa: F401

    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Missing dependency 'pypandoc'. Install it with: pip install pypandoc"
        ) from exc


def _ensure_pandoc_available() -> None:
    import pypandoc

    try:
        pypandoc.get_pandoc_version()
    except OSError:
        print("Pandoc not found. Downloading a local Pandoc binary via pypandoc...", file=sys.stderr)
        pypandoc.download_pandoc(delete_installer=True)
        pypandoc.get_pandoc_version()


def _build_pdf(input_md: Path, output_pdf: Path, preamble_tex: Path) -> None:
    import pypandoc

    template_tex = _repo_root() / "resources" / "pandoc" / "template.tex"
    if not template_tex.exists():
        raise FileNotFoundError(f"Pandoc template not found: {template_tex}")

    titlepage_tex = _repo_root() / "resources" / "pandoc" / "titlepage.tex"
    if not titlepage_tex.exists():
        raise FileNotFoundError(f"Title page TeX not found: {titlepage_tex}")

    extra_args = [
        "--from=markdown+raw_tex+link_attributes",
        "--to=pdf",
        "--pdf-engine=xelatex",
        "--template",
        template_tex.as_posix(),
        "--include-before-body",
        titlepage_tex.as_posix(),
        "--toc",
        "--listings",
        "--number-sections",
        "--top-level-division=section",
        f"--include-in-header={preamble_tex.as_posix()}",
        "-V",
        "urlcolor=blue",
        "-V",
        "geometry:margin=2.6cm",
    ]

    output_pdf.parent.mkdir(parents=True, exist_ok=True)

    pypandoc.convert_file(
        source_file=str(input_md),
        to="pdf",
        format="markdown",
        outputfile=str(output_pdf),
        extra_args=extra_args,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a polished thesis-seminar PDF from docs/thesis-seminar.md"
    )
    parser.add_argument(
        "--input",
        default=None,
        help="Path to the input Markdown file (default: docs/thesis-seminar.md)",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Path to the output PDF file (default: dist/thesis-seminar.pdf)",
    )
    args = parser.parse_args()

    root = _repo_root()
    input_md = Path(args.input) if args.input else (root / "docs" / "thesis-seminar.md")
    output_pdf = Path(args.output) if args.output else (root / "dist" / "thesis-seminar.pdf")
    preamble_tex = root / "resources" / "pandoc" / "preamble.tex"

    if not input_md.exists():
        raise FileNotFoundError(f"Input Markdown not found: {input_md}")
    if not preamble_tex.exists():
        raise FileNotFoundError(f"Preamble TeX not found: {preamble_tex}")

    os.chdir(root)

    _ensure_pypandoc()
    _ensure_pandoc_available()

    print(f"Building PDF: {output_pdf}")
    _build_pdf(input_md=input_md, output_pdf=output_pdf, preamble_tex=preamble_tex)

    if not output_pdf.exists() or output_pdf.stat().st_size == 0:
        raise RuntimeError("PDF generation finished but output file is missing or empty")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
