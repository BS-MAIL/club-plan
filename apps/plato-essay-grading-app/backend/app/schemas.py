from pydantic import BaseModel, Field


class ExamCreate(BaseModel):
    name: str
    subject: str = ""
    class_name: str = ""
    pages_per_student: int = Field(gt=0)
    formula_recognition_enabled: bool = True


class ExamOut(ExamCreate):
    id: int

    class Config:
        from_attributes = True


class StudentCreate(BaseModel):
    student_no: str
    name: str
    order_index: int
    is_absent: bool = False


class StudentOut(StudentCreate):
    id: int

    class Config:
        from_attributes = True


class StudentAbsenceUpdate(BaseModel):
    absent_student_ids: list[int] = Field(default_factory=list)


class QuestionCreate(BaseModel):
    question_no: int
    max_score: float
    question_text: str = ""
    model_answer: str = ""
    rubric_text: str = ""


class QuestionUpdate(QuestionCreate):
    pass


class SimilarAnswerCreate(BaseModel):
    title: str = ""
    text: str
    source_reason: str = ""


class SimilarAnswerUpdate(SimilarAnswerCreate):
    pass


class SimilarAnswerOut(SimilarAnswerCreate):
    id: int
    question_id: int

    class Config:
        from_attributes = True


class RubricNoteCreate(BaseModel):
    section: str = "인정 유사답안"
    text: str


class SimilarRubricGenerateRequest(BaseModel):
    similar_answer_reason: str


class SimilarRubricGenerateOut(BaseModel):
    text: str


class QuestionOut(QuestionCreate):
    id: int
    similar_answers: list[SimilarAnswerOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class ReferenceImportOut(BaseModel):
    imported_count: int
    questions: list[QuestionOut]
    message: str


class RegionCreate(BaseModel):
    question_id: int | None = None
    region_type: str
    page_offset: int = Field(ge=0)
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class RegionOut(RegionCreate):
    id: int

    class Config:
        from_attributes = True


class SubmissionOut(BaseModel):
    id: int
    student_id: int
    student_no: str
    student_name: str
    start_page: int
    end_page: int
    match_status: str


class OcrOut(BaseModel):
    id: int
    submission_id: int
    question_id: int
    text_result: str
    latex_result: str
    normalized_result: str
    confidence: float
    needs_review: bool

    class Config:
        from_attributes = True


class GradeRequest(BaseModel):
    submission_id: int
    question_id: int
    force: bool = False


class GradeOut(BaseModel):
    submission_id: int
    question_id: int
    final_score: float
    needs_teacher_review: bool
    review_scores: list[float]
    max_deviation: float
    final_reason: str
    review_reasons: list[str] = []
    similar_answer_review: bool = False
    similar_answer_reason: str = ""


class TeacherOverrideRequest(BaseModel):
    score: float
    note: str = ""
    clear_review: bool = True


class TeacherOverrideOut(BaseModel):
    submission_id: int
    question_id: int
    final_score: float
    teacher_override_score: float | None = None
    effective_score: float
    teacher_note: str = ""
    teacher_reviewed: bool = False


class GradingJobCreate(BaseModel):
    force: bool = False


class FailedJobItem(BaseModel):
    submission_id: int
    question_id: int | None = None
    student_label: str
    question_label: str
    stage: str
    error: str


class GradingJobOut(BaseModel):
    job_id: str
    exam_id: int
    status: str
    done: int
    total: int
    label: str
    force: bool
    failed_items: list[FailedJobItem]
    review_needed_count: int = 0


class ReviewResultOut(BaseModel):
    round_no: int
    score: float
    confidence: float
    reasoning: str
    deduction_reasons: str
    missing_steps: str
    ocr_risk: str


class DeductionOut(BaseModel):
    step_name: str
    points_lost: float
    reason: str
    short_reason: str = ""
    ocr_related: bool = False


class AnswerAnnotationOut(BaseModel):
    annotation_type: str
    label: str
    reason: str
    evidence_text: str = ""
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    confidence: float = 0


class QuestionResultOut(BaseModel):
    question_id: int
    question_no: int
    max_score: float
    final_score: float | None = None
    ai_score: float | None = None
    teacher_override_score: float | None = None
    teacher_note: str = ""
    teacher_reviewed: bool = False
    needs_teacher_review: bool
    final_reason: str
    deduction_reasons: str
    missing_steps: str
    ocr_risk: str
    ocr_confidence: float | None = None
    ocr_text: str
    ocr_needs_review: bool
    max_deviation: float
    review_reasons: list[str]
    deductions: list[DeductionOut]
    similar_answer_review: bool = False
    similar_answer_reason: str = ""
    annotations: list[AnswerAnnotationOut] = []
    reviews: list[ReviewResultOut]


class SubmissionResultsOut(BaseModel):
    submission_id: int
    student_no: str
    student_name: str
    questions: list[QuestionResultOut]
    total_score: float
    needs_teacher_review_count: int


class DetectedRegionOut(BaseModel):
    question_id: int | None = None
    question_no: int | None = None
    page_offset: int
    x: float
    y: float
    width: float
    height: float
    detected_x: float
    detected_y: float
    detected_width: float
    detected_height: float
    confidence: float


class AutoDetectRegionsOut(BaseModel):
    regions: list[DetectedRegionOut]
    message: str
