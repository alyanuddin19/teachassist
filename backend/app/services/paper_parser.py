import re
import io
from typing import List, Dict, Any
import pdfplumber
from fastapi import UploadFile

# Conditional import for docx
try:
    from docx import Document
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False
    print("WARNING: python-docx not installed. Word document support disabled.")


async def extract_text_from_pdf(upload: UploadFile) -> str:
    """Extract text from PDF file"""
    pdf_bytes = await upload.read()
    
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        text = ""
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text += page_text + "\n"
    return text


async def extract_text_from_docx(upload: UploadFile) -> str:
    """Extract text from Word document"""
    if not DOCX_AVAILABLE:
        raise ImportError(
            "python-docx not installed. Please run: pip install python-docx"
        )
    
    docx_bytes = await upload.read()
    doc = Document(io.BytesIO(docx_bytes))
    text = ""
    for paragraph in doc.paragraphs:
        text += paragraph.text + "\n"
    return text


async def extract_text_from_document(upload: UploadFile) -> str:
    """
    Automatically detect file type and extract text
    Supports: PDF, DOCX, DOC, TXT
    """
    filename = upload.filename.lower() if upload.filename else ""
    
    if filename.endswith('.pdf'):
        return await extract_text_from_pdf(upload)
    elif filename.endswith('.docx') or filename.endswith('.doc'):
        return await extract_text_from_docx(upload)
    elif filename.endswith('.txt'):
        content = await upload.read()
        return content.decode('utf-8')
    else:
        raise ValueError(
            f"Unsupported file format: {filename}. "
            "Please upload PDF, DOCX, or TXT file."
        )


def detect_course_code(text: str) -> str:
    """Extract course code like CSC-102 / CIS 201 / SE-301 from text."""
    patterns = [
        r"\b([A-Z]{2,4}\s*-\s*\d{2,4}[A-Z]?)\b",
        r"\b([A-Z]{2,4}\s+\d{2,4}[A-Z]?)\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, text.upper())
        if match:
            return re.sub(r"\s+", "", match.group(1)).replace("--", "-")
    return ""


def detect_questions(text: str) -> List[tuple]:
    """
    Detect questions with flexible patterns:
    - Question-1:, Question 1:, Question-1, Question 1
    - Q1:, Q.1:, Q 1, Q-1, Q1
    - 1), 1., (1), 1:
    """
    patterns = [
        # Question patterns (more flexible)
        r"Question\s*[-:\s]*(\d+)\s*:?",    # Question-1:, Question 1:, Question 1
        r"\bQ\.?\s*[-:\s]*(\d+)\s*:?",      # Q1:, Q.1:, Q-1:, Q 1
        r"^\s*(\d+)\s*[\.):\]]",            # 1), 1., 1:, 1]
        r"^\s*\((\d+)\)",                    # (1)
    ]
    
    all_matches = []
    for pattern in patterns:
        matches = list(re.finditer(pattern, text, flags=re.MULTILINE | re.IGNORECASE))
        for m in matches:
            all_matches.append(m)
            print(f"🔍 Match found: '{m.group(0)}' → Q{m.group(1)} at position {m.start()}")
    
    # Remove duplicates and sort by position
    seen_numbers = set()
    unique_matches = []
    for match in sorted(all_matches, key=lambda m: m.start()):
        q_no = int(match.group(1))
        if q_no not in seen_numbers:
            seen_numbers.add(q_no)
            unique_matches.append((q_no, match.start(), match.end()))
    
    return sorted(unique_matches, key=lambda x: x[1])


def extract_marks(text: str) -> float:
    """
    Extract marks from various formats:
    - (5 Marks), [5 Marks], 5 Marks
    - (5M), [5M], 5M
    - Marks: 5, M: 5
    """
    patterns = [
        r"[\(\[]?\s*(\d+)\s*(?:Marks?|M)\s*[\)\]]?",
        r"Marks?\s*[:=]?\s*(\d+)",
        r"M\s*[:=]?\s*(\d+)",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return float(match.group(1))
    
    return None


def extract_clo(text: str) -> str:
    """
    Extract CLO from various formats with extensive pattern matching
    Supports:
    - CLO-2, CLO 2, CLO:2, CLO2, CLO.2
    - [CLO-2], (CLO-2), {CLO-2}
    - CO-2, CO2, Course Outcome 2
    - LO-2, LO2, Learning Outcome 2
    - PLO-2, PLO2, Program Learning Outcome 2
    - "Outcome 2", "Outcome: 2"
    """
    patterns = [
        # CLO variations
        r"CLO[\s\.\-:]*(\d+)",
        r"\[CLO[\s\.\-:]*(\d+)\]",
        r"\(CLO[\s\.\-:]*(\d+)\)",
        r"\{CLO[\s\.\-:]*(\d+)\}",
        
        # Course Outcome
        r"Course\s+(?:Learning\s+)?Outcome[\s\.\-:]*(\d+)",
        r"CO[\s\.\-:]*(\d+)",
        r"\[CO[\s\.\-:]*(\d+)\]",
        
        # Learning Outcome
        r"Learning\s+Outcome[\s\.\-:]*(\d+)",
        r"LO[\s\.\-:]*(\d+)",
        r"\[LO[\s\.\-:]*(\d+)\]",
        
        # Program Learning Outcome
        r"Program\s+Learning\s+Outcome[\s\.\-:]*(\d+)",
        r"PLO[\s\.\-:]*(\d+)",
        r"\[PLO[\s\.\-:]*(\d+)\]",
        
        # Generic Outcome
        r"Outcome[\s\.\-:]*(\d+)",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            clo_num = match.group(1)
            print(f"🎯 CLO detected: CLO-{clo_num} using pattern: {pattern[:30]}...")
            return f"CLO-{clo_num}"
    
    print(f"⚠️  CLO not found in text: {text[:100]}...")
    return "CLO-Unknown"


async def parse_question_paper(upload: UploadFile) -> List[Dict[str, Any]]:
    """
    Parse question paper from PDF, DOCX, or TXT
    Returns list of questions with id, text, max_marks, and clo
    """
    try:
        # Extract text from document
        text = await extract_text_from_document(upload)
        
        # 🔍 DEBUG: Print extracted text (first 500 chars)
        print("=" * 50)
        print("EXTRACTED TEXT (first 500 chars):")
        print(text[:500])
        print("=" * 50)
        
        if not text.strip():
            raise ValueError("Document is empty or text could not be extracted")
        
        # Detect questions
        matches = detect_questions(text)
        
        # 🔍 DEBUG: Print detected matches
        print(f"DETECTED QUESTIONS: {len(matches)}")
        for q_no, start, end in matches[:5]:  # Show first 5
            print(f"  - Q{q_no} at position {start}")
        print("=" * 50)
        
        if not matches:
            # Provide helpful error message
            raise ValueError(
                "No questions detected in the document. "
                "Please ensure questions are numbered using one of these formats:\n"
                "  • Q1, Q.1, Q-1, Q 1\n"
                "  • Question 1, Question-1\n"
                "  • 1), 1., (1)\n\n"
                f"File: {upload.filename}\n"
                f"Extracted text length: {len(text)} characters\n"
                f"First 200 characters: {text[:200]}"
            )
        
        questions = []
        for i, (q_no, start, end) in enumerate(matches):
            # Extract question block
            block_start = start
            block_end = matches[i + 1][1] if i + 1 < len(matches) else len(text)
            block = text[block_start:block_end].strip()
            
            # Extract marks and CLO
            max_marks = extract_marks(block)
            clo = extract_clo(block)
            
            # Warning if marks not found
            if max_marks is None:
                print(f"⚠️  Warning: Marks not found for Q{q_no}, defaulting to 0")
                max_marks = 0.0
            
            questions.append({
                "id": f"Q{q_no}",
                "text": block[:500],  # Limit text length for storage
                "max_marks": max_marks,
                "clo": clo
            })
        
        # Sort by question number
        questions.sort(key=lambda x: int(x["id"][1:]))
        
        print(f"✅ Successfully parsed {len(questions)} questions")
        return questions
        
    except Exception as e:
        print(f"❌ Error in parse_question_paper: {str(e)}")
        raise
