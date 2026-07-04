# Math Essay Grader

Localhost MVP for grading Korean handwritten math constructed-response answers.

## What is included

- FastAPI backend with SQLite storage.
- Next.js frontend for the first workflow.
- Excel student-list import.
- Whole-class PDF upload and fixed-page submission splitting.
- Question rubric storage.
- Drag-based region selection for question crops on the first student's PDF preview.
- OpenAI Vision first-pass image interpretation for Korean handwritten math answers.
- Gemini Vision fallback when OpenAI interpretation is uncertain.
- Optional Mathpix fallback remains available if you add Mathpix keys later.
- OpenAI four-round grading integration with safe placeholder behavior when API keys are missing.
- Student score Excel export.

## Folder structure

```text
essay-grading-app/
  backend/
    app/
      main.py
      models.py
      schemas.py
      services.py
      database.py
      config.py
    requirements.txt
    .env.example
  frontend/
    app/
      page.tsx
      layout.tsx
      styles.css
    package.json
```

## Backend setup

```powershell
cd C:\Users\USER\essay-grading-app\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` and add keys:

```text
OPENAI_API_KEY="your_openai_api_key"
OPENAI_MODEL="gpt-4o"
GEMINI_API_KEY="your_gemini_api_key"
GEMINI_MODEL="gemini-2.0-flash"
OCR_CONFIDENCE_THRESHOLD="0.75"

# Optional fallback only if GPT/Gemini is not good enough later.
MATHPIX_APP_ID=""
MATHPIX_APP_KEY=""
```

Run the backend:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open API docs at `http://localhost:8000/docs`.

## Frontend setup

```powershell
cd C:\Users\USER\essay-grading-app\frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Student Excel format

The first worksheet should use this header row:

```text
학번 | 이름
10101 | 김민수
10102 | 이서연
```

Rows are imported in order, and the PDF is split by that order.

## Current MVP workflow

1. Create an exam and set pages per student.
2. Upload the student Excel list.
3. Upload the whole-class answer PDF.
4. Add each question rubric and score.
5. Select each question, choose the page offset, and drag the answer region on the first student's page preview.
6. Run AI image interpretation and grading for the first student and first question.
7. Download the score Excel.

## Important notes

- The region selector uses the first student's pages as a template and applies the same crop coordinates to every student.
- The current run button processes only the first student and first question so the API pipeline can be verified safely.
- OpenAI is used first for image interpretation. Gemini runs only when the OpenAI result is uncertain or low confidence.
- If API keys are missing, image interpretation and grading create placeholder review results rather than failing hard.
- Keep real answer PDFs inside `backend/data/`, which is ignored by git.

## Next implementation steps

1. Add batch AI image interpretation and batch grading for all submissions and questions.
2. Add interpretation correction UI and regrade-one-question flow.
3. Add detailed review screen with round-by-round score deviation.
4. Add optional feedback PDF export.
