# Essay Grading App Feature Guide

This app is a local FastAPI and Next.js tool for AI-assisted grading of Korean handwritten constructed-response math answers.

## Main Workflow

1. Create an exam group by entering the exam name, subject, grade, class range, pages per student, and formula-recognition option.
2. Upload the student list Excel file for each class.
3. Upload question and rubric reference PDFs, or enter questions and rubrics manually.
4. Upload or detect the blank answer template and save answer regions for each question.
5. Upload each class answer PDF so the backend can split it into student submissions.
6. Run AI grading for one class, only ungraded submissions, one question, or all classes in the group.
7. Review results by student or by question, adjust teacher scores, and export scores to Excel.

## Exam And Class Management

- Creates multiple classes at once from a start and end class number.
- Groups classes by exam name, subject, page count, and formula-recognition setting.
- Keeps class-specific students, submissions, grading jobs, and results separate.
- Supports deleting an exam group when all related classes should be removed.

## Student List And Absence Handling

- Imports students from Excel in the order used for PDF splitting.
- Supports an optional absence column in the Excel file.
- Provides a UI for marking students as absent before answer PDF upload.
- Excludes absent students from expected answer PDF page counts.
- Warns when absence settings changed after answer PDFs were already uploaded.

## Question And Rubric Management

- Imports questions, model answers, max scores, and step rubrics from reference PDFs.
- Allows question PDF only, rubric PDF only, or both PDFs for automatic import.
- Uses both files together when both are provided.
- Generates a minimal rubric with review markers when only partial reference material is available.
- Supports manual question creation and editing.
- Stores similar-answer rules per question for accepted alternative solutions.

## Answer Region Setup

- Uploads a blank answer template PDF for the exam group.
- Automatically detects likely answer regions from the template.
- Lets the teacher review, adjust, and save detected regions.
- Applies saved question regions consistently across submissions in the same exam group.

## PDF Upload And Submission Splitting

- Uploads a whole-class answer PDF per class.
- Splits the PDF into per-student submissions using pages-per-student and student order.
- Shows detailed page-count mismatch information.
- Allows ignored pages when cover pages or extra pages are present.
- Saves per-student submission page ranges for review.

## AI OCR And Grading

- Crops each saved question region from each student submission.
- Uses OpenAI vision for Korean handwritten answer interpretation.
- Uses Gemini as a fallback when OCR confidence is low or review is needed.
- Can disable formula recognition for exams where plain text recognition is preferred.
- Detects blank or meaningless answers and records a 0-point result without unnecessary review.
- Falls back to teacher-review-needed results when OCR or grading AI fails.

## Batch Grading Jobs

- Runs full grading for the selected class.
- Runs only ungraded work when previous results should be preserved.
- Regrades a single selected question.
- Starts grading jobs for all classes in the selected exam group.
- Shows progress, running labels, review-needed counts, and failed items.

## Results And Review

- Displays results by student or by question.
- Shows selected class average in the format `반 평균 : 20점`.
- Shows total score, per-question score, deductions, OCR risk, and teacher-review flags.
- Shows cropped answer previews with annotations where available.
- Allows teacher score override with a note.
- Provides filters for all students, ungraded items, review-needed items, and similar answers.

## Similar Answer Support

- Flags answers that appear valid but differ from the model answer or rubric.
- Generates a draft accepted-similar-answer rubric from the grading result.
- Lets the teacher save, edit, or delete similar-answer rules.
- Applies similar-answer rules across matching questions in the exam group.

## Export

- Exports class score results to Excel.
- Uses the selected results class for the export target.

## Local Development

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open the frontend at `http://localhost:3000` and the backend API docs at `http://localhost:8000/docs`.

## Required Environment Keys

Set these in `backend/.env`:

```text
OPENAI_API_KEY="your_openai_api_key"
OPENAI_MODEL="gpt-4o"
GEMINI_API_KEY="your_gemini_api_key"
GEMINI_MODEL="gemini-2.0-flash"
OCR_CONFIDENCE_THRESHOLD="0.75"
```

Optional Mathpix fallback keys can also be configured if needed.

## Operational Notes

- Keep real student answer PDFs and generated data under ignored backend data folders.
- Check detected answer regions before running large batch grading jobs.
- Mark absent students before uploading answer PDFs.
- Use teacher review for low-confidence OCR, unusual diagrams, or alternative solutions.
- Do not rely on AI scores without review when a result is flagged as uncertain.
