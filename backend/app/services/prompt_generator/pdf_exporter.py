"""PDF exporter for the prompt generator module."""

import re
import unicodedata


def export_to_pdf(content: str, output_path: str, exam_type: str = "exam", filename: str = "document"):
    del exam_type, filename

    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    except ImportError as exc:
        raise RuntimeError("reportlab package is not installed. Please run: pip install reportlab") from exc

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    heading1_style = ParagraphStyle(
        "ExamHeading1",
        parent=styles["Heading1"],
        fontSize=16,
        spaceAfter=6,
        spaceBefore=12,
        textColor=colors.HexColor("#173f7a"),
        fontName="Helvetica-Bold",
    )
    heading2_style = ParagraphStyle(
        "ExamHeading2",
        parent=styles["Heading2"],
        fontSize=13,
        spaceAfter=4,
        spaceBefore=10,
        textColor=colors.HexColor("#244aa5"),
        fontName="Helvetica-Bold",
    )
    body_style = ParagraphStyle(
        "ExamBody",
        parent=styles["Normal"],
        fontSize=11,
        spaceAfter=4,
        spaceBefore=2,
        leading=16,
        fontName="Helvetica",
        textColor=colors.HexColor("#22324f"),
    )

    story = []
    normalized_content = _normalize_pdf_text(content)

    for line in normalized_content.split("\n"):
        stripped = line.strip()
        if not stripped:
            story.append(Spacer(1, 4))
            continue
        if stripped in ("---", "***", "___"):
            story.append(Spacer(1, 4))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#c9d5ef")))
            story.append(Spacer(1, 4))
            continue
        if stripped.startswith("# "):
            story.append(Paragraph(_clean_md(stripped[2:]), heading1_style))
            continue
        if stripped.startswith("## "):
            story.append(Paragraph(_clean_md(stripped[3:]), heading2_style))
            continue
        if stripped.startswith("### "):
            story.append(Paragraph(f"<b>{_clean_md(stripped[4:])}</b>", body_style))
            continue
        story.append(Paragraph(_md_to_reportlab(stripped), body_style))

    doc.build(story)


def _clean_md(text: str) -> str:
    text = _normalize_pdf_text(text)
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"\*(.*?)\*", r"\1", text)
    text = re.sub(r"`(.*?)`", r"\1", text)
    return text


def _md_to_reportlab(text: str) -> str:
    text = _normalize_pdf_text(text)
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*(.*?)\*", r"<i>\1</i>", text)
    text = re.sub(r"`(.*?)`", r"<font face=\"Courier\">\1</font>", text)
    return text


def _normalize_pdf_text(text: str) -> str:
    replacements = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2022": "-",
        "\u2026": "...",
        "\u00a0": " ",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)

    # ReportLab's default Helvetica font is much safer with ASCII-ish text.
    normalized = unicodedata.normalize("NFKD", text)
    return normalized.encode("ascii", "ignore").decode("ascii")
