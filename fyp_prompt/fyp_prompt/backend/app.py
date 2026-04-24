import os
import json
import uuid
import traceback
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import tempfile

# Load environment variables from backend/.env
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))


from utils.file_parser import parse_file
from utils.prompt_builder import build_prompt, get_constraints
from utils.ai_generator import generate_exam, list_available_models
from utils.pdf_exporter import export_to_pdf
from utils.image_analyzer import analyze_all_images, is_llava_available

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
GENERATED_FOLDER = os.path.join(os.path.dirname(__file__), 'generated')
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'pptx', 'ppt'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(GENERATED_FOLDER, exist_ok=True)

# In-memory session store
sessions = {}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')


@app.route('/api/models', methods=['GET'])
def get_models():
    """Return list of locally available Ollama models."""
    models = list_available_models()
    return jsonify({'models': models, 'default': 'llama3.1:8b'})


@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Only PDF, DOCX, and PPT/PPTX files are allowed.'}), 400

    filename = secure_filename(file.filename)
    session_id = str(uuid.uuid4())
    save_path = os.path.join(UPLOAD_FOLDER, f"{session_id}_{filename}")
    file.save(save_path)

    sessions[session_id] = {
        'file_path': save_path,
        'filename': filename,
        'file_type': filename.rsplit('.', 1)[1].lower()
    }

    return jsonify({
        'session_id': session_id,
        'filename': filename,
        'message': 'File uploaded successfully'
    })


@app.route('/api/generate-prompt', methods=['POST'])
def generate_prompt():
    data = request.json
    session_id = data.get('session_id')

    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session. Please upload a file first.'}), 400

    session_ids      = data.get('session_ids', [session_id])
    exam_type        = data.get('exam_type')
    mcq_count        = data.get('mcq_count', 0)
    mcq_marks        = data.get('mcq_marks', 1)
    theory_questions = data.get('theory_questions', [])

    if not exam_type:
        return jsonify({'error': 'Exam type is required'}), 400

    # Validate all session IDs exist
    for sid in session_ids:
        if sid not in sessions:
            return jsonify({'error': f'Invalid session ID: {sid}. Please re-upload.'}), 400

    # ── Marks-limit validation ──────────────────────────────────────────────
    constraints  = get_constraints(exam_type)
    max_marks    = constraints['max_marks']
    time_allowed = constraints['time']

    total_mcq    = mcq_count * mcq_marks
    total_theory = sum(q.get('marks', 0) for q in theory_questions)
    grand_total  = total_mcq + total_theory

    if max_marks is not None and grand_total > max_marks:
        exam_label = {'quiz': 'Quiz', 'mid': 'Mid-Term', 'final': 'Final Exam', 'assignment': 'Assignment'}.get(
            exam_type.lower(), exam_type.title()
        )
        return jsonify({
            'error': (
                f"{exam_label} total marks cannot exceed {max_marks}. "
                f"Your current configuration is {grand_total} marks. "
                f"Please reduce the number or marks of questions."
            )
        }), 400
    # ───────────────────────────────────────────────────────────────────────

    # Collect filenames from all sessions
    all_filenames = [sessions[sid]['filename'] for sid in session_ids]

    # Update primary session with config + all session IDs
    primary = sessions[session_id]
    primary.update({
        'session_ids':      session_ids,
        'all_filenames':    all_filenames,
        'exam_type':        exam_type,
        'mcq_count':        mcq_count,
        'mcq_marks':        mcq_marks,
        'theory_questions': theory_questions
    })

    prompt = build_prompt(
        filename=', '.join(all_filenames),
        exam_type=exam_type,
        mcq_count=mcq_count,
        mcq_marks=mcq_marks,
        theory_questions=theory_questions
    )

    primary['prompt'] = prompt
    return jsonify({'prompt': prompt, 'time_allowed': time_allowed, 'max_marks': max_marks})


@app.route('/api/generate-exam', methods=['POST'])
def generate_exam_route():
    data = request.json
    session_id = data.get('session_id')

    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session. Please upload a file first.'}), 400

    session = sessions[session_id]

    if 'prompt' not in session:
        return jsonify({'error': 'Please generate a prompt first.'}), 400

    try:
        MAX_IMAGES = 20   # cap total images across all files to keep speed manageable

        all_text   = []
        all_images = []

        # Collect all session IDs stored on the primary session
        session_ids = session.get('session_ids', [session_id])

        for sid in session_ids:
            if sid not in sessions:
                continue
            s = sessions[sid]
            print(f"[Parse] Processing file: {s['filename']}")
            text, imgs = parse_file(s['file_path'], s['file_type'])
            if text:
                all_text.append(f"=== FILE: {s['filename']} ===\n{text}")
            # Add images up to the cap
            remaining = MAX_IMAGES - len(all_images)
            if remaining > 0 and imgs:
                all_images.extend(imgs[:remaining])

        combined_text = "\n\n".join(all_text)

        if not combined_text or len(combined_text.strip()) < 50:
            return jsonify({'error': 'Could not extract sufficient content from the uploaded file(s). Please ensure the files have readable text.'}), 400

        # Analyze images with llava (if any and llava is available)
        image_descriptions = ""
        if all_images:
            print(f"[Image Analysis] Found {len(all_images)} image(s) across all files — analyzing with llava...")
            image_descriptions = analyze_all_images(all_images)
            if image_descriptions:
                print(f"[Image Analysis] Done. Descriptions injected into document content.")

        # Combine text + image descriptions
        combined_content = combined_text
        if image_descriptions:
            combined_content += (
                "\n\n=== DOCUMENT IMAGES (Vision-Analyzed for Question Generation) ==="
                + image_descriptions
                + "\n=== END OF IMAGE ANALYSIS ==="
            )

        # Generate exam using AI
        exam_content = generate_exam(
            document_content=combined_content,
            prompt=session['prompt'],
            exam_type=session['exam_type'],
            mcq_count=session.get('mcq_count', 0),
            mcq_marks=session.get('mcq_marks', 1),
            theory_questions=session.get('theory_questions', [])
        )

        session['exam_content'] = exam_content
        return jsonify({
            'exam_content':    exam_content,
            'images_analyzed': len(all_images),
            'llava_used':      bool(image_descriptions and is_llava_available())
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Failed to generate exam: {str(e)}'}), 500


@app.route('/api/save-exam', methods=['POST'])
def save_exam():
    data = request.json
    session_id = data.get('session_id')
    edited_content = data.get('content')

    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session.'}), 400

    sessions[session_id]['exam_content'] = edited_content
    return jsonify({'message': 'Exam saved successfully'})


@app.route('/api/download-pdf', methods=['POST'])
def download_pdf():
    data = request.json
    session_id = data.get('session_id')
    content = data.get('content')

    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session.'}), 400

    session = sessions[session_id]
    filename = session.get('filename', 'exam').rsplit('.', 1)[0]
    exam_type = session.get('exam_type', 'exam')

    pdf_filename = f"{filename}_{exam_type}_paper.pdf"
    pdf_path = os.path.join(GENERATED_FOLDER, f"{session_id}_{pdf_filename}")

    try:
        export_to_pdf(content, pdf_path, exam_type=exam_type, filename=filename)
        return send_file(pdf_path, as_attachment=True, download_name=pdf_filename, mimetype='application/pdf')
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Failed to generate PDF: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
