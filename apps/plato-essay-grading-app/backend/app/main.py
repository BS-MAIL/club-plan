from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models, schemas, services
from app.config import get_settings
from app.database import get_db, init_db


settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "app": settings.app_name}


@app.post("/exams", response_model=schemas.ExamOut)
def create_exam(payload: schemas.ExamCreate, db: Session = Depends(get_db)):
    exam = models.Exam(**payload.model_dump())
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


@app.get("/exams", response_model=list[schemas.ExamOut])
def list_exams(db: Session = Depends(get_db)):
    return db.query(models.Exam).order_by(models.Exam.id.desc()).all()


@app.delete("/exams/{exam_id}")
def delete_exam(exam_id: int, db: Session = Depends(get_db)):
    try:
        services.delete_exam(db, exam_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"deleted": exam_id}


@app.post("/exams/{exam_id}/students/import")
def import_students(exam_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    path = services.save_upload(file, settings.upload_dir, f"exam_{exam_id}_students.xlsx")
    count = services.import_students_from_excel(db, exam_id, path)
    return {"imported": count}


@app.get("/exams/{exam_id}/students", response_model=list[schemas.StudentOut])
def list_students(exam_id: int, db: Session = Depends(get_db)):
    return db.query(models.Student).filter_by(exam_id=exam_id).order_by(models.Student.order_index).all()


@app.put("/exams/{exam_id}/students/absences", response_model=list[schemas.StudentOut])
def update_student_absences(exam_id: int, payload: schemas.StudentAbsenceUpdate, db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    return services.update_student_absences(db, exam_id, payload.absent_student_ids)


@app.post("/exams/{exam_id}/questions", response_model=schemas.QuestionOut)
def create_question(exam_id: int, payload: schemas.QuestionCreate, db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    question = models.Question(exam_id=exam_id, **payload.model_dump())
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@app.get("/exams/{exam_id}/questions", response_model=list[schemas.QuestionOut])
def list_questions(exam_id: int, db: Session = Depends(get_db)):
    return db.query(models.Question).filter_by(exam_id=exam_id).order_by(models.Question.question_no).all()


@app.put("/questions/{question_id}", response_model=schemas.QuestionOut)
def update_question(question_id: int, payload: schemas.QuestionUpdate, db: Session = Depends(get_db)):
    question = db.get(models.Question, question_id)
    if not question:
        raise HTTPException(404, "Question not found")
    for key, value in payload.model_dump().items():
        setattr(question, key, value)
    db.commit()
    db.refresh(question)
    return question


@app.post("/questions/{question_id}/rubric-notes", response_model=schemas.QuestionOut)
def add_rubric_note(question_id: int, payload: schemas.RubricNoteCreate, db: Session = Depends(get_db)):
    try:
        return services.add_rubric_note(db, question_id, payload.section, payload.text)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/questions/{question_id}/similar-answers", response_model=schemas.SimilarAnswerOut)
def create_similar_answer(question_id: int, payload: schemas.SimilarAnswerCreate, db: Session = Depends(get_db)):
    try:
        return services.create_similar_answer(db, question_id, payload.title, payload.text, payload.source_reason)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.put("/similar-answers/{answer_id}", response_model=schemas.SimilarAnswerOut)
def update_similar_answer(answer_id: int, payload: schemas.SimilarAnswerUpdate, db: Session = Depends(get_db)):
    try:
        return services.update_similar_answer(db, answer_id, payload.title, payload.text, payload.source_reason)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.delete("/similar-answers/{answer_id}")
def delete_similar_answer(answer_id: int, db: Session = Depends(get_db)):
    try:
        services.delete_similar_answer(db, answer_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"deleted": answer_id}


@app.post("/questions/{question_id}/similar-rubric", response_model=schemas.SimilarRubricGenerateOut)
def generate_similar_rubric(question_id: int, payload: schemas.SimilarRubricGenerateRequest, db: Session = Depends(get_db)):
    try:
        text = services.generate_similar_answer_rubric(db, question_id, payload.similar_answer_reason)
        return schemas.SimilarRubricGenerateOut(text=text)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/exams/{exam_id}/reference/import", response_model=schemas.ReferenceImportOut)
async def import_reference_pdfs(
    exam_id: int,
    question_file: UploadFile | None = File(None),
    answer_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    if not question_file and not answer_file:
        raise HTTPException(400, "Upload at least one question or answer/rubric PDF file")
    question_path = None
    answer_path = None
    if question_file:
        question_filename = question_file.filename or ""
        if not question_filename.lower().endswith(".pdf"):
            raise HTTPException(400, "Question file must be a PDF file")
        question_path = services.save_upload(question_file, settings.upload_dir, f"exam_{exam_id}_questions.pdf")
    if answer_file:
        answer_filename = answer_file.filename or ""
        if not answer_filename.lower().endswith(".pdf"):
            raise HTTPException(400, "Answer/rubric file must be a PDF file")
        answer_path = services.save_upload(answer_file, settings.upload_dir, f"exam_{exam_id}_answers_rubric.pdf")
    try:
        imported = await services.import_reference_pdfs(db, exam_id, question_path, answer_path)
        return schemas.ReferenceImportOut(
            imported_count=len(imported),
            questions=imported,
            message=f"{len(imported)} questions were imported.",
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, f"Reference PDF import failed: {type(exc).__name__}: {exc}") from exc


@app.post("/exams/{exam_id}/regions", response_model=schemas.RegionOut)
def create_region(exam_id: int, payload: schemas.RegionCreate, db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    region = db.query(models.Region).filter_by(
        exam_id=exam_id,
        question_id=payload.question_id,
        region_type=payload.region_type,
    ).first()
    if region:
        for key, value in payload.model_dump().items():
            setattr(region, key, value)
    else:
        region = models.Region(exam_id=exam_id, **payload.model_dump())
        db.add(region)
    db.commit()
    db.refresh(region)
    return region


@app.get("/exams/{exam_id}/regions", response_model=list[schemas.RegionOut])
def list_regions(exam_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    return db.query(models.Region).filter_by(exam_id=exam_id).order_by(models.Region.page_offset, models.Region.id).all()


@app.delete("/regions/{region_id}")
def delete_region(region_id: int, db: Session = Depends(get_db)):
    region = db.get(models.Region, region_id)
    if not region:
        raise HTTPException(404, "Region not found")
    db.delete(region)
    db.commit()
    return {"deleted": region_id}


@app.post("/exams/{exam_id}/pdf")
def upload_pdf(exam_id: int, file: UploadFile = File(...), ignored_pages: str | None = Form(None), db: Session = Depends(get_db)):
    exam = db.get(models.Exam, exam_id)
    if not exam:
        raise HTTPException(404, "Exam not found")
    path = services.save_upload(file, settings.upload_dir, f"exam_{exam_id}_answers.pdf")
    try:
        count = services.split_pdf_into_submissions(db, exam, path, ignored_pages)
    except services.PdfPageCountMismatch as exc:
        raise HTTPException(400, exc.to_detail()) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"created_submissions": count}


@app.post("/exams/{exam_id}/answer-template")
def upload_answer_template(exam_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    filename = file.filename or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Answer template must be a PDF file")
    services.save_answer_template(file, exam_id)
    return {"saved": True}


@app.get("/exams/{exam_id}/answer-template/pages/{page_offset}/preview")
def preview_answer_template_page(exam_id: int, page_offset: int, db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    try:
        path = services.render_answer_template_preview(exam_id, page_offset)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return FileResponse(path, media_type="image/png")


@app.post("/exams/{exam_id}/regions/auto-detect", response_model=schemas.AutoDetectRegionsOut)
async def auto_detect_regions(exam_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    try:
        regions = await services.detect_answer_template_regions(db, exam_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return schemas.AutoDetectRegionsOut(regions=regions, message=f"{len(regions)} regions detected.")


@app.get("/exams/{exam_id}/submissions", response_model=list[schemas.SubmissionOut])
def list_submissions(exam_id: int, db: Session = Depends(get_db)):
    submissions = db.query(models.Submission).filter_by(exam_id=exam_id).all()
    return [
        schemas.SubmissionOut(
            id=item.id,
            student_id=item.student_id,
            student_no=item.student.student_no,
            student_name=item.student.name,
            start_page=item.start_page,
            end_page=item.end_page,
            match_status=item.match_status,
        )
        for item in submissions
    ]


@app.post("/submissions/{submission_id}/ocr")
async def run_ocr(submission_id: int, force: bool = False, db: Session = Depends(get_db)):
    try:
        count = await services.create_ocr_for_submission(db, submission_id, force=force)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"ocr_results": count}


@app.get("/submissions/{submission_id}/ocr", response_model=list[schemas.OcrOut])
def list_ocr(submission_id: int, db: Session = Depends(get_db)):
    return db.query(models.OcrResult).filter_by(submission_id=submission_id).all()


@app.get("/submissions/{submission_id}/pages/{page_offset}/preview")
def preview_submission_page(submission_id: int, page_offset: int, db: Session = Depends(get_db)):
    submission = db.get(models.Submission, submission_id)
    if not submission:
        raise HTTPException(404, "Submission not found")
    try:
        path = services.render_submission_page_preview(submission, page_offset)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return FileResponse(path, media_type="image/png")


@app.get("/submissions/{submission_id}/questions/{question_id}/preview")
def preview_submission_question(submission_id: int, question_id: int, db: Session = Depends(get_db)):
    submission = db.get(models.Submission, submission_id)
    if not submission:
        raise HTTPException(404, "Submission not found")
    region = db.query(models.Region).filter_by(
        exam_id=submission.exam_id,
        question_id=question_id,
        region_type="question",
    ).first()
    if not region:
        raise HTTPException(404, "Question region not found")
    path = services.render_submission_region_preview(submission, region)
    return FileResponse(path, media_type="image/png")


@app.post("/grade", response_model=schemas.GradeOut)
async def grade(payload: schemas.GradeRequest, db: Session = Depends(get_db)):
    try:
        return await services.grade_submission_question_cached(db, payload.submission_id, payload.question_id, force=payload.force)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/exams/{exam_id}/grading-jobs", response_model=schemas.GradingJobOut)
def create_grading_job(exam_id: int, payload: schemas.GradingJobCreate, db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    return services.start_grading_job(exam_id, force=payload.force)


@app.post("/exams/{exam_id}/questions/{question_id}/regrade-job", response_model=schemas.GradingJobOut)
def create_question_regrade_job(exam_id: int, question_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    if not db.get(models.Question, question_id):
        raise HTTPException(404, "Question not found")
    return services.start_question_regrade_job(exam_id, question_id)


@app.delete("/exams/{exam_id}/grading-results")
def delete_exam_grading_results(exam_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    return services.delete_grading_results(db, exam_id)


@app.delete("/exams/{exam_id}/questions/{question_id}/grading-results")
def delete_question_grading_results(exam_id: int, question_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    if not db.get(models.Question, question_id):
        raise HTTPException(404, "Question not found")
    return services.delete_grading_results(db, exam_id, question_id)


@app.get("/grading-jobs/{job_id}", response_model=schemas.GradingJobOut)
def get_grading_job(job_id: str):
    try:
        return services.get_grading_job(job_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.put("/scores/{submission_id}/{question_id}/teacher-override", response_model=schemas.TeacherOverrideOut)
def teacher_override_score(submission_id: int, question_id: int, payload: schemas.TeacherOverrideRequest, db: Session = Depends(get_db)):
    try:
        return services.save_teacher_override(db, submission_id, question_id, payload.score, payload.note, payload.clear_review)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.get("/exams/{exam_id}/grading-results", response_model=list[schemas.SubmissionResultsOut])
def grading_results(exam_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    return services.get_grading_results(db, exam_id)


@app.get("/exams/{exam_id}/export/scores")
def export_scores(exam_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Exam, exam_id):
        raise HTTPException(404, "Exam not found")
    path = services.export_scores_excel(db, exam_id)
    return FileResponse(path, filename=Path(path).name)
