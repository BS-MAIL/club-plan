from sqlalchemy import create_engine
from sqlalchemy import inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings


settings = get_settings()
engine = create_engine(settings.database_url, connect_args={"check_same_thread": False, "timeout": 30})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(text("PRAGMA journal_mode=WAL"))
        connection.execute(text("PRAGMA busy_timeout=30000"))
    ensure_legacy_columns()


def ensure_legacy_columns() -> None:
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "exams" in table_names:
        exam_columns = {column["name"] for column in inspector.get_columns("exams")}
        with engine.begin() as connection:
            if "subject" not in exam_columns:
                connection.execute(text("ALTER TABLE exams ADD COLUMN subject VARCHAR(100) DEFAULT ''"))
            if "formula_recognition_enabled" not in exam_columns:
                connection.execute(text("ALTER TABLE exams ADD COLUMN formula_recognition_enabled BOOLEAN DEFAULT 1"))
    if "students" in table_names:
        student_columns = {column["name"] for column in inspector.get_columns("students")}
        with engine.begin() as connection:
            if "is_absent" not in student_columns:
                connection.execute(text("ALTER TABLE students ADD COLUMN is_absent BOOLEAN DEFAULT 0"))
    if "questions" not in table_names:
        return
    columns = {column["name"] for column in inspector.get_columns("questions")}
    if "question_text" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE questions ADD COLUMN question_text TEXT DEFAULT ''"))
    if "grading_reviews" in table_names:
        review_columns = {column["name"] for column in inspector.get_columns("grading_reviews")}
        with engine.begin() as connection:
            if "similar_answer_review" not in review_columns:
                connection.execute(text("ALTER TABLE grading_reviews ADD COLUMN similar_answer_review BOOLEAN DEFAULT 0"))
            if "similar_answer_reason" not in review_columns:
                connection.execute(text("ALTER TABLE grading_reviews ADD COLUMN similar_answer_reason TEXT DEFAULT ''"))
    if "final_scores" in table_names:
        final_columns = {column["name"] for column in inspector.get_columns("final_scores")}
        with engine.begin() as connection:
            if "teacher_note" not in final_columns:
                connection.execute(text("ALTER TABLE final_scores ADD COLUMN teacher_note TEXT DEFAULT ''"))
            if "teacher_reviewed" not in final_columns:
                connection.execute(text("ALTER TABLE final_scores ADD COLUMN teacher_reviewed BOOLEAN DEFAULT 0"))
            if "teacher_reviewed_at" not in final_columns:
                connection.execute(text("ALTER TABLE final_scores ADD COLUMN teacher_reviewed_at DATETIME"))
