# ExamForge — AI Exam Paper Generator

An AI-powered exam paper generator that converts uploaded documents (PDF, DOCX, PPT) into professionally formatted exam papers using Google Gemini AI.

---

## Features

- 📄 **File Upload** — Supports PDF, DOCX, PPT, and PPTX
- 🎓 **Exam Types** — Quiz, Mid-Term, and Final exam configurations
- 🔢 **Custom Structure** — Configure MCQ count/marks and individual theory question marks
- 🤖 **AI Generation** — Powered by Google Gemini 1.5 Flash
- ✏️ **Live Editor** — Edit generated content with Markdown preview
- 📥 **PDF Export** — Download a formatted PDF of your exam paper

---

## Project Structure

```
fyp_prompt/
├── backend/
│   ├── app.py                  # Flask API server
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # API key template
│   ├── uploads/                # Temporary uploaded files
│   ├── generated/              # Generated PDF files
│   └── utils/
│       ├── file_parser.py      # PDF/DOCX/PPT text extraction
│       ├── prompt_builder.py   # AI prompt construction
│       ├── ai_generator.py     # Gemini AI integration
│       └── pdf_exporter.py     # ReportLab PDF generation
└── frontend/
    ├── index.html              # Main UI
    ├── style.css               # Premium dark theme styles
    └── app.js                  # Frontend logic & API calls
```

---

## Setup Instructions

### 1. Get a Gemini API Key

1. Visit [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key

### 2. Configure Environment

```powershell
# Copy the example env file
Copy-Item backend\.env.example backend\.env

# Open it and paste your API key
notepad backend\.env
```

Your `.env` file should look like:
```
GEMINI_API_KEY=AIzaSy...your_key_here
```

### 3. Install Python Dependencies

```powershell
cd backend
pip install -r requirements.txt
```

### 4. Run the Application

**Option A — Use the startup script:**
```powershell
.\start.ps1
```

**Option B — Manual:**
```powershell
cd backend
# Set env variable (PowerShell)
$env:GEMINI_API_KEY = "your_key_here"
python app.py
```

### 5. Open the App

Open your browser and navigate to:
```
http://localhost:5000
```

---

## How to Use

1. **Upload** — Drag & drop or click to upload your document (PDF/DOCX/PPT)
2. **Configure** — Select exam type (Quiz/Mid/Final), set MCQ count & marks, add theory questions with individual marks
3. **Generate Prompt** — Review the AI prompt that will be used
4. **Generate Now** — Click "Generate Now" to let AI create your exam paper instantly
5. **Edit** — Modify the generated content in the built-in editor
6. **Download** — Export as a formatted PDF

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload document file |
| POST | `/api/generate-prompt` | Build AI prompt from config |
| POST | `/api/generate-exam` | Generate exam with AI |
| POST | `/api/save-exam` | Save edited exam content |
| POST | `/api/download-pdf` | Export exam as PDF |

---

## Requirements

- Python 3.9+
- Google Gemini API key (free tier available)
- Internet connection (for AI generation)
