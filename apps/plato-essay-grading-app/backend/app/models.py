from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Exam(Base):
    __tablename__ = "exams"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    subject: Mapped[str] = mapped_column(String(100), default="")
    class_name: Mapped[str] = mapped_column(String(100), default="")
    pages_per_student: Mapped[int] = mapped_column(Integer)
    formula_recognition_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    students: Mapped[list["Student"]] = relationship(cascade="all, delete-orphan")
    questions: Mapped[list["Question"]] = relationship(cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"))
    student_no: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(100))
    order_index: Mapped[int] = mapped_column(Integer)
    is_absent: Mapped[bool] = mapped_column(Boolean, default=False)


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"))
    question_no: Mapped[int] = mapped_column(Integer)
    max_score: Mapped[float] = mapped_column(Float)
    question_text: Mapped[str] = mapped_column(Text, default="")
    model_answer: Mapped[str] = mapped_column(Text, default="")
    rubric_text: Mapped[str] = mapped_column(Text, default="")

    similar_answers: Mapped[list["SimilarAnswer"]] = relationship(cascade="all, delete-orphan", order_by="SimilarAnswer.id")


class SimilarAnswer(Base):
    __tablename__ = "similar_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    title: Mapped[str] = mapped_column(String(200), default="")
    text: Mapped[str] = mapped_column(Text, default="")
    source_reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Region(Base):
    __tablename__ = "regions"

    id: Mapped[int] = mapped_column(primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"))
    question_id: Mapped[int | None] = mapped_column(ForeignKey("questions.id"), nullable=True)
    region_type: Mapped[str] = mapped_column(String(30))
    page_offset: Mapped[int] = mapped_column(Integer)
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    width: Mapped[float] = mapped_column(Float)
    height: Mapped[float] = mapped_column(Float)


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"))
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"))
    start_page: Mapped[int] = mapped_column(Integer)
    end_page: Mapped[int] = mapped_column(Integer)
    file_path: Mapped[str] = mapped_column(String(500), default="")
    match_status: Mapped[str] = mapped_column(String(50), default="pending")

    student: Mapped[Student] = relationship()


class OcrResult(Base):
    __tablename__ = "ocr_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    image_path: Mapped[str] = mapped_column(String(500), default="")
    text_result: Mapped[str] = mapped_column(Text, default="")
    latex_result: Mapped[str] = mapped_column(Text, default="")
    normalized_result: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float] = mapped_column(Float, default=0)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)


class GradingReview(Base):
    __tablename__ = "grading_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    round_no: Mapped[int] = mapped_column(Integer)
    score: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    reasoning: Mapped[str] = mapped_column(Text, default="")
    deduction_reasons: Mapped[str] = mapped_column(Text, default="")
    missing_steps: Mapped[str] = mapped_column(Text, default="")
    ocr_risk: Mapped[str] = mapped_column(String(30), default="unknown")
    similar_answer_review: Mapped[bool] = mapped_column(Boolean, default=False)
    similar_answer_reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FinalScore(Base):
    __tablename__ = "final_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    final_score: Mapped[float] = mapped_column(Float)
    teacher_override_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    final_reason: Mapped[str] = mapped_column(Text, default="")
    needs_teacher_review: Mapped[bool] = mapped_column(Boolean, default=False)
    teacher_note: Mapped[str] = mapped_column(Text, default="")
    teacher_reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    teacher_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AnswerAnnotation(Base):
    __tablename__ = "answer_annotations"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    annotation_type: Mapped[str] = mapped_column(String(30))
    label: Mapped[str] = mapped_column(String(100), default="")
    reason: Mapped[str] = mapped_column(Text, default="")
    evidence_text: Mapped[str] = mapped_column(Text, default="")
    x: Mapped[float | None] = mapped_column(Float, nullable=True)
    y: Mapped[float | None] = mapped_column(Float, nullable=True)
    width: Mapped[float | None] = mapped_column(Float, nullable=True)
    height: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
