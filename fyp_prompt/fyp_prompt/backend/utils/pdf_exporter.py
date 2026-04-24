"""
PDF Exporter utility - converts exam content to a downloadable PDF.
"""
import re
from datetime import datetime


def export_to_pdf(content: str, output_path: str, exam_type: str = 'exam', filename: str = 'document'):
    """
    Export exam content to a styled PDF file.

    Args:
        content: Markdown exam content
        output_path: Where to save the PDF
        exam_type: Type of exam for the header
        filename: Original document name for context
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm, mm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
            Table, TableStyle, KeepTogether
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        _build_pdf_reportlab(content, output_path, exam_type, filename)

    except ImportError:
        raise RuntimeError(
            "reportlab package is not installed. "
            "Please run: pip install reportlab"
        )


def _build_pdf_reportlab(content: str, output_path: str, exam_type: str, filename: str):
    """Build PDF using reportlab."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )

    # Define styles
    styles = getSampleStyleSheet()

    heading1_style = ParagraphStyle(
        'ExamHeading1',
        parent=styles['Heading1'],
        fontSize=16,
        spaceAfter=6,
        spaceBefore=12,
        textColor=colors.HexColor('#1a1a2e'),
        fontName='Helvetica-Bold',
    )

    heading2_style = ParagraphStyle(
        'ExamHeading2',
        parent=styles['Heading2'],
        fontSize=13,
        spaceAfter=4,
        spaceBefore=10,
        textColor=colors.HexColor('#16213e'),
        fontName='Helvetica-Bold',
    )

    body_style = ParagraphStyle(
        'ExamBody',
        parent=styles['Normal'],
        fontSize=11,
        spaceAfter=4,
        spaceBefore=2,
        leading=16,
        fontName='Helvetica',
        textColor=colors.HexColor('#2d2d2d'),
    )

    bold_style = ParagraphStyle(
        'ExamBold',
        parent=body_style,
        fontName='Helvetica-Bold',
    )

    instruction_style = ParagraphStyle(
        'ExamInstruction',
        parent=body_style,
        fontSize=10,
        textColor=colors.HexColor('#555555'),
        fontName='Helvetica-Oblique',
    )

    story = []

    # Process markdown content
    lines = content.split('\n')

    for line in lines:
        line_stripped = line.strip()

        if not line_stripped:
            story.append(Spacer(1, 4))
            continue

        # Horizontal rule
        if line_stripped in ('---', '***', '___'):
            story.append(Spacer(1, 4))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cccccc')))
            story.append(Spacer(1, 4))
            continue

        # H1 heading
        if line_stripped.startswith('# '):
            text = _clean_md(line_stripped[2:])
            story.append(Paragraph(text, heading1_style))
            continue

        # H2 heading
        if line_stripped.startswith('## '):
            text = _clean_md(line_stripped[3:])
            story.append(Paragraph(text, heading2_style))
            continue

        # H3 heading
        if line_stripped.startswith('### '):
            text = _clean_md(line_stripped[4:])
            story.append(Paragraph(f'<b>{text}</b>', body_style))
            continue

        # Convert markdown bold/italic inline
        text = _md_to_reportlab(line_stripped)
        story.append(Paragraph(text, body_style))

    # Build PDF
    doc.build(story)


def _clean_md(text: str) -> str:
    """Remove markdown formatting characters."""
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'\*(.*?)\*', r'\1', text)
    text = re.sub(r'`(.*?)`', r'\1', text)
    return text


def _md_to_reportlab(text: str) -> str:
    """Convert markdown inline formatting to ReportLab XML tags."""
    # Escape XML special characters first
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')

    # Bold
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    # Italic
    text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', text)
    # Code
    text = re.sub(r'`(.*?)`', r'<font face="Courier">\1</font>', text)

    return text
