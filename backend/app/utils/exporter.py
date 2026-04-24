from docx import Document
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def export_docx(text: str) -> BytesIO:
    doc = Document()
    for line in text.split("\n"):
        doc.add_paragraph(line)

    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer


def export_pdf(text: str) -> BytesIO:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    y = height - 40
    for line in text.split("\n"):
        if y < 40:
            pdf.showPage()
            y = height - 40
        pdf.drawString(40, y, line[:100])
        y -= 14

    pdf.save()
    buffer.seek(0)
    return buffer
