"use client";

import { FormEvent, MouseEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const RUBRIC_STEP_TEMPLATE = `[단계별 채점 기준]
1. 판단 (1점): 옳지 않음으로 판단
2. 반례제시 (2점): 규칙적이지만 순환하지 않는 무한소수 제시
3. 이유제시 (1점): 분수로 나타낼 수 없는 이유 제시`;

type Exam = {
  id: number;
  name: string;
  subject: string;
  class_name: string;
  pages_per_student: number;
  formula_recognition_enabled: boolean;
};

type Question = {
  id: number;
  question_no: number;
  max_score: number;
  question_text: string;
  model_answer: string;
  rubric_text: string;
  similar_answers: SimilarAnswer[];
};

type SimilarAnswer = {
  id: number;
  question_id: number;
  title: string;
  text: string;
  source_reason: string;
};

type Submission = {
  id: number;
  student_id: number;
  student_no: string;
  student_name: string;
  start_page: number;
  end_page: number;
  match_status: string;
};

type Student = {
  id: number;
  student_no: string;
  name: string;
  order_index: number;
  is_absent: boolean;
};

type Region = {
  id: number;
  question_id: number | null;
  region_type: string;
  page_offset: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type ImageSize = {
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
};

type ReferenceImportResult = {
  imported_count: number;
  message: string;
  questions: Question[];
};

type PdfPageCountMismatchDetail = {
  code: "pdf_page_count_mismatch";
  message: string;
  actual_pages: number;
  expected_pages: number;
  remaining_pages: number;
  difference: number;
  student_count: number;
  absent_count?: number;
  present_count?: number;
  pages_per_student: number;
  ignored_pages: number[];
};

type ActiveTab = "setup" | "questions" | "regions" | "grading" | "results";

type GradingQuestionResult = {
  question_id: number;
  question_no: number;
  max_score: number;
  final_score: number | null;
  ai_score: number | null;
  teacher_override_score: number | null;
  teacher_note: string;
  teacher_reviewed: boolean;
  needs_teacher_review: boolean;
  final_reason: string;
  deduction_reasons: string;
  missing_steps: string;
  ocr_risk: string;
  ocr_confidence: number | null;
  ocr_text: string;
  ocr_needs_review: boolean;
  max_deviation: number;
  review_reasons: string[];
  deductions: Deduction[];
  similar_answer_review: boolean;
  similar_answer_reason: string;
  annotations: AnswerAnnotation[];
};

type Deduction = {
  step_name: string;
  points_lost: number;
  reason: string;
  short_reason?: string;
  ocr_related: boolean;
};

type AnswerAnnotation = {
  annotation_type: string;
  label: string;
  reason: string;
  evidence_text: string;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  confidence: number;
};

type SubmissionResults = {
  submission_id: number;
  student_no: string;
  student_name: string;
  questions: GradingQuestionResult[];
  total_score: number;
  needs_teacher_review_count: number;
};

type FailedGradingItem = {
  submission_id: number;
  question_id: number | null;
  student_label: string;
  question_label: string;
  stage: "ocr" | "grade";
  error: string;
};

type ResultViewMode = "student" | "question";
type SubmissionFilter = "all" | "ungraded" | "review" | "similar";

type SelectedResult = {
  submissionId: number;
  questionId: number;
} | null;

type GradingJob = {
  job_id: string;
  exam_id: number;
  status: string;
  done: number;
  total: number;
  label: string;
  force: boolean;
  failed_items: FailedGradingItem[];
  review_needed_count: number;
};

type ActiveGradingJob = GradingJob & {
  class_name: string;
};

type DetectedRegion = {
  question_id: number | null;
  question_no: number | null;
  page_offset: number;
  x: number;
  y: number;
  width: number;
  height: number;
  detected_x: number;
  detected_y: number;
  detected_width: number;
  detected_height: number;
  confidence: number;
};

type SimilarRubricDraft = {
  questionId: number;
  questionNo: number;
  title: string;
  text: string;
  sourceReason: string;
} | null;

type AnswerMagnifier = {
  visible: boolean;
  x: number;
  y: number;
  backgroundX: number;
  backgroundY: number;
  backgroundWidth: number;
  backgroundHeight: number;
};

const ANSWER_MAGNIFIER_SIZE = 168;
const ANSWER_MAGNIFIER_ZOOM = 2.35;

export default function Home() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamKey, setSelectedExamKey] = useState<string>("");
  const [selectedGradingExamId, setSelectedGradingExamId] = useState<number | null>(null);
  const [selectedResultsExamId, setSelectedResultsExamId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [results, setResults] = useState<SubmissionResults[]>([]);
  const [status, setStatus] = useState("Ready");
  const [activeTab, setActiveTab] = useState<ActiveTab>("setup");
  const [examDropdownOpen, setExamDropdownOpen] = useState(false);
  const [showManualQuestionForm, setShowManualQuestionForm] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradingProgress, setGradingProgress] = useState({ done: 0, total: 0, label: "" });
  const [failedGradingItems, setFailedGradingItems] = useState<FailedGradingItem[]>([]);
  const [regradeQuestionId, setRegradeQuestionId] = useState<number | null>(null);
  const [regionQuestionId, setRegionQuestionId] = useState<number | null>(null);
  const [previewPageOffset, setPreviewPageOffset] = useState(0);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [questionPdf, setQuestionPdf] = useState<File | null>(null);
  const [answerPdf, setAnswerPdf] = useState<File | null>(null);
  const [studentListFile, setStudentListFile] = useState<File | null>(null);
  const [studentAnswersPdf, setStudentAnswersPdf] = useState<File | null>(null);
  const [answerTemplatePdf, setAnswerTemplatePdf] = useState<File | null>(null);
  const [answerTemplateUploaded, setAnswerTemplateUploaded] = useState(false);
  const [referenceImportResult, setReferenceImportResult] = useState<ReferenceImportResult | null>(null);
  const [previewImageSize, setPreviewImageSize] = useState<ImageSize | null>(null);
  const [resultViewMode, setResultViewMode] = useState<ResultViewMode>("student");
  const [submissionFilter, setSubmissionFilter] = useState<SubmissionFilter>("all");
  const [selectedResult, setSelectedResult] = useState<SelectedResult>(null);
  const [resultPreviewSize, setResultPreviewSize] = useState<ImageSize | null>(null);
  const [activeGradingJobs, setActiveGradingJobs] = useState<ActiveGradingJob[]>([]);
  const [detectedRegions, setDetectedRegions] = useState<DetectedRegion[]>([]);
  const [templatePageOffset, setTemplatePageOffset] = useState(0);
  const [templatePreviewSize, setTemplatePreviewSize] = useState<ImageSize | null>(null);
  const [selectedQuestionDetailId, setSelectedQuestionDetailId] = useState<number | null>(null);
  const [similarRubricDraft, setSimilarRubricDraft] = useState<SimilarRubricDraft>(null);
  const [formulaRecognitionDraft, setFormulaRecognitionDraft] = useState(true);
  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
  const [absenceDraftStudentIds, setAbsenceDraftStudentIds] = useState<number[]>([]);
  const [answerMagnifier, setAnswerMagnifier] = useState<AnswerMagnifier>({ visible: false, x: 0, y: 0, backgroundX: 0, backgroundY: 0, backgroundWidth: 0, backgroundHeight: 0 });
  const imageRef = useRef<HTMLImageElement | null>(null);

  const examGroups = useMemo(() => groupExamsByName(exams), [exams]);
  const selectedExamGroup = useMemo(() => {
    const key = selectedExamKey || examGroups[0]?.key || "";
    return examGroups.find((group) => group.key === key) ?? examGroups[0] ?? null;
  }, [examGroups, selectedExamKey]);
  const selectedExam = selectedExamGroup?.exams[0] ?? null;
  const selectedGradingExam = exams.find((exam) => exam.id === selectedGradingExamId) ?? selectedExamGroup?.exams[0] ?? null;
  const selectedResultsExam = exams.find((exam) => exam.id === selectedResultsExamId) ?? selectedExamGroup?.exams[0] ?? null;
  const activeRect = drag ? makeRect(drag.startX, drag.startY, drag.currentX, drag.currentY) : selection;
  const savedRegionsForPage = regions.filter((region) => region.page_offset === previewPageOffset && region.region_type === "question");
  const selectedSavedRegion = savedRegionsForPage.find((region) => region.question_id === regionQuestionId) ?? null;
  const selectedResultSubmission = selectedResult ? results.find((item) => item.submission_id === selectedResult.submissionId) : null;
  const selectedResultQuestion = selectedResultSubmission?.questions.find((item) => item.question_id === selectedResult?.questionId) ?? null;
  const selectedResultRubricText = selectedResultQuestion ? questions.find((item) => item.id === selectedResultQuestion.question_id || item.question_no === selectedResultQuestion.question_no)?.rubric_text ?? "" : "";
  const selectedResultPreviewUrl = selectedResult ? `${API}/submissions/${selectedResult.submissionId}/questions/${selectedResult.questionId}/preview` : null;
  const templatePreviewUrl = selectedExam ? `${API}/exams/${selectedExam.id}/answer-template/pages/${templatePageOffset}/preview` : null;
  const dragTemplatePreviewUrl = selectedExam ? `${API}/exams/${selectedExam.id}/answer-template/pages/${previewPageOffset}/preview` : null;
  const selectedQuestionDetail = questions.find((item) => item.id === selectedQuestionDetailId) ?? questions[0] ?? null;
  const selectedResultStudentIndex = selectedResult ? results.findIndex((item) => item.submission_id === selectedResult.submissionId) : -1;
  const selectedResultQuestionIndex = selectedResultSubmission && selectedResult ? selectedResultSubmission.questions.findIndex((item) => item.question_id === selectedResult.questionId) : -1;
  const selectedResultAnnotations = selectedResultQuestion ? visibleAnswerAnnotations(selectedResultQuestion) : [];
  const selectedResultBoxAnnotations = selectedResultAnnotations.filter(hasAnnotationBox);
  const selectedResultFallbackAnnotations = selectedResultAnnotations.filter((annotation) => !hasAnnotationBox(annotation));
  const resultQuestionOptions = results[0]?.questions ?? [];
  const selectedClassAverageScore = results.length > 0 ? results.reduce((sum, submission) => sum + submission.total_score, 0) / results.length : null;
  const submissionRows = makeSubmissionRows(students, submissions, results, questions.length);
  const filteredSubmissionRows = submissionRows.filter((row) => submissionFilter === "all" || row.statuses.includes(submissionFilter));
  const absentCount = students.filter((student) => student.is_absent).length;
  const gradingStatusDone = isFullGradingComplete(students, submissions, results, questions.length);
  const activeJobIds = useMemo(() => activeGradingJobs.map((job) => job.job_id).sort().join(","), [activeGradingJobs]);

  async function refresh() {
    const examRes = await fetch(`${API}/exams`);
    const examData = await examRes.json() as Exam[];
    setExams(examData);
    const groups = groupExamsByName(examData);
    const groupKey = groups.some((group) => group.key === selectedExamKey) ? selectedExamKey : groups[0]?.key ?? "";
    const group = groups.find((item) => item.key === groupKey) ?? groups[0];
    if (group) {
      setSelectedExamKey(group.key);
      const representativeId = group.exams[0].id;
      const gradingId = group.exams.some((exam) => exam.id === selectedGradingExamId) ? selectedGradingExamId : representativeId;
      const resultsId = group.exams.some((exam) => exam.id === selectedResultsExamId) ? selectedResultsExamId : representativeId;
      setSelectedGradingExamId(gradingId ?? representativeId);
      setSelectedResultsExamId(resultsId ?? representativeId);
      const [qRes, studentRes, sRes, rRes, resultRes] = await Promise.all([
        fetch(`${API}/exams/${representativeId}/questions`),
        fetch(`${API}/exams/${gradingId ?? representativeId}/students`),
        fetch(`${API}/exams/${gradingId ?? representativeId}/submissions`),
        fetch(`${API}/exams/${representativeId}/regions`),
        fetch(`${API}/exams/${resultsId ?? representativeId}/grading-results`)
      ]);
      setQuestions(await qRes.json());
      setStudents(await studentRes.json());
      setSubmissions(await sRes.json());
      setRegions(await rRes.json());
      setResults(await resultRes.json());
    } else {
      setSelectedExamKey("");
      setSelectedGradingExamId(null);
      setSelectedResultsExamId(null);
      setQuestions([]);
      setStudents([]);
      setSubmissions([]);
      setRegions([]);
      setResults([]);
      setRegionQuestionId(null);
    }
  }

  useEffect(() => {
    if (questions.length > 0 && !regionQuestionId) {
      setRegionQuestionId(questions[0].id);
    }
    if (questions.length > 0 && !selectedQuestionDetailId) {
      setSelectedQuestionDetailId(questions[0].id);
    }
  }, [questions, regionQuestionId, selectedQuestionDetailId]);

  useEffect(() => {
    refresh().catch(() => setStatus("Backend is not running yet."));
  }, []);

  useEffect(() => {
    if (selectedExamKey || selectedGradingExamId || selectedResultsExamId) {
      refresh().catch(() => setStatus("Could not refresh selected exam."));
    }
  }, [selectedExamKey, selectedGradingExamId, selectedResultsExamId]);

  useEffect(() => {
    setPreviewImageSize(null);
  }, [dragTemplatePreviewUrl]);

  useEffect(() => {
    setResultPreviewSize(null);
  }, [selectedResultPreviewUrl]);

  useEffect(() => {
    setTemplatePreviewSize(null);
  }, [templatePreviewUrl]);

  useEffect(() => {
    if (activeGradingJobs.length === 0) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const jobs = await Promise.all(activeGradingJobs.map(async (activeJob) => {
          const res = await fetch(`${API}/grading-jobs/${activeJob.job_id}`);
          if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
          const job = await res.json() as GradingJob;
          return { ...job, class_name: activeJob.class_name };
        }));
        if (stopped) return;
        setActiveGradingJobs(jobs);
        const total = jobs.reduce((sum, job) => sum + job.total, 0);
        const done = jobs.reduce((sum, job) => sum + job.done, 0);
        const running = jobs.filter((job) => job.status !== "done" && job.status !== "failed");
        const failedItems = jobs.flatMap((job) => job.failed_items.map((item) => ({ ...item, student_label: `${classShortLabel(job.class_name)} ${item.student_label}` })));
        setGradingProgress({ done, total, label: running.length > 0 ? `${running.length}개 반 채점 중` : "동시 채점 완료" });
        setFailedGradingItems(failedItems);
        setStatus(`채점 작업: ${running.length}개 반 진행 중 (${done}/${total})`);
        if (running.length === 0) {
          setGrading(false);
          setActiveGradingJobs([]);
          setActiveTab(failedItems.length > 0 ? "grading" : "results");
          await refresh();
        }
      } catch (err) {
        setStatus(`채점 작업 조회 오류: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 1500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeJobIds]);

  async function createExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const grade = Number(form.get("grade"));
    const classStart = Number(form.get("class_start"));
    const classEnd = Number(form.get("class_end"));
    for (let classNo = classStart; classNo <= classEnd; classNo += 1) {
      await fetch(`${API}/exams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          subject: form.get("subject"),
          class_name: `${grade}학년 ${classNo}반`,
          pages_per_student: Number(form.get("pages_per_student")),
          formula_recognition_enabled: form.get("formula_recognition_enabled") === "on"
        })
      });
    }
    formElement.reset();
    setFormulaRecognitionDraft(true);
    setStatus(`${grade}학년 ${classStart}반~${classEnd}반 시험을 생성했습니다.`);
    await refresh();
  }

  async function uploadFile(path: string, field: string, file: File | null, extraFields?: Record<string, string>) {
    if (!file) return;
    const form = new FormData();
    form.append(field, file);
    for (const [key, value] of Object.entries(extraFields ?? {})) {
      form.append(key, value);
    }
    const res = await fetch(`${API}${path}`, { method: "POST", body: form });
    if (!res.ok) throw new ApiError(await readApiPayload(res));
  }

  async function fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
    return await res.json() as T;
  }

  async function uploadAnswersPdfWithIgnorePrompt(file: File | null, ignoredPages = "") {
    if (!selectedGradingExam || !file) return;
    try {
      await uploadFile(`/exams/${selectedGradingExam.id}/pdf`, "file", file, ignoredPages ? { ignored_pages: ignoredPages } : undefined);
      setStatus(`${selectedGradingExam.class_name} 답안 PDF를 학생별로 나눴습니다.`);
      setStudentAnswersPdf(null);
      await refresh();
    } catch (err) {
      const detail = err instanceof ApiError ? getPdfPageCountMismatch(err.payload) : null;
      if (detail) {
        const ignored = window.prompt(
          `페이지 수가 맞지 않습니다.\n\n현재 PDF: ${detail.actual_pages}페이지\n예상 페이지: ${detail.expected_pages}페이지\n응시 학생: ${detail.present_count ?? detail.student_count}명 / 미응시: ${detail.absent_count ?? 0}명\n차이: ${detail.difference > 0 ? "+" : ""}${detail.difference}페이지\n\n무시할 페이지 번호를 입력하세요.\n예: 1, ${detail.actual_pages} 또는 1-2`,
          detail.ignored_pages.join(", ")
        );
        if (ignored === null) {
          setStatus("답안 PDF 업로드를 취소했습니다.");
          return;
        }
        await uploadAnswersPdfWithIgnorePrompt(file, ignored);
        return;
      }
      throw err;
    }
  }

  async function fetchQuestionsForExam(examId: number): Promise<Question[]> {
    const res = await fetch(`${API}/exams/${examId}/questions`);
    if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
    return await res.json() as Question[];
  }

  async function importReferencePdfs() {
    if (!selectedExamGroup || (!questionPdf && !answerPdf)) return;
    setReferenceImportResult(null);
    setStatus("선택한 참고 파일로 모든 반의 문항과 채점기준을 자동 입력 중입니다...");
    let imported: ReferenceImportResult | null = null;
    for (const exam of selectedExamGroup.exams) {
      const form = new FormData();
      if (questionPdf) form.append("question_file", questionPdf);
      if (answerPdf) form.append("answer_file", answerPdf);
      const res = await fetch(`${API}/exams/${exam.id}/reference/import`, { method: "POST", body: form });
      const payload = await readApiPayload(res);
      if (!res.ok) throw new Error(formatApiError(payload));
      imported = payload as ReferenceImportResult;
    }
    if (!imported) return;
    setReferenceImportResult(imported);
    setStatus(`${selectedExamGroup.exams.length}개 반에 ${imported.imported_count}개 문항을 자동 입력했습니다.`);
    await refresh();
  }

  async function uploadAnswerTemplate() {
    if (!selectedExamGroup || !answerTemplatePdf) return;
    for (const exam of selectedExamGroup.exams) {
      await uploadFile(`/exams/${exam.id}/answer-template`, "file", answerTemplatePdf);
    }
    setAnswerTemplateUploaded(true);
    setStatus("모든 반에 빈 답안 양식을 저장했습니다.");
    setTemplatePreviewSize(null);
  }

  async function autoDetectTemplateRegions() {
    if (!selectedExam) return;
    setStatus("빈 답안 양식에서 답안 영역을 자동 인식 중입니다...");
    const res = await fetch(`${API}/exams/${selectedExam.id}/regions/auto-detect`, { method: "POST" });
    const payload = await readApiPayload(res);
    if (!res.ok) throw new Error(formatApiError(payload));
    const data = payload as { regions: DetectedRegion[]; message: string };
    setDetectedRegions(data.regions);
    setStatus(`${data.regions.length}개 답안 영역을 찾았습니다. 저장 전 수정할 수 있습니다.`);
  }

  async function saveDetectedRegions() {
    if (!selectedExamGroup) return;
    for (const exam of selectedExamGroup.exams) {
      const targetQuestions = exam.id === selectedExam?.id ? questions : await fetchQuestionsForExam(exam.id);
      for (const region of detectedRegions) {
        const sourceQuestion = questions.find((item) => item.id === region.question_id || item.question_no === region.question_no);
        const targetQuestion = targetQuestions.find((item) => item.question_no === sourceQuestion?.question_no || item.question_no === region.question_no);
        if (!targetQuestion) continue;
        const res = await fetch(`${API}/exams/${exam.id}/regions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            region_type: "question",
            question_id: targetQuestion.id,
            page_offset: region.page_offset,
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height
          })
        });
        if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
      }
    }
    setStatus("모든 반에 자동 인식 영역을 저장했습니다.");
    await refresh();
  }

  async function saveTeacherOverride(question: GradingQuestionResult, score: number, note: string) {
    if (!selectedResult) return;
    const res = await fetch(`${API}/scores/${selectedResult.submissionId}/${question.question_id}/teacher-override`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, note, clear_review: true })
    });
    if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
    setStatus("교사 점수를 저장했습니다.");
    await refresh();
  }

  async function addSimilarAnswerToRubric(question: GradingQuestionResult) {
    if (!window.confirm("채점기준에 추가하시겠습니까?")) return;
    const reason = question.similar_answer_reason || question.final_reason;
    if (!reason.trim()) {
      setStatus("추가할 유사답안 설명이 없습니다.");
      return;
    }
    setStatus("AI가 유사답안 채점기준을 생성 중입니다...");
    const genRes = await fetch(`${API}/questions/${question.question_id}/similar-rubric`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ similar_answer_reason: reason })
    });
    const genPayload = await readApiPayload(genRes);
    if (!genRes.ok) throw new Error(formatApiError(genPayload));
    setSimilarRubricDraft({
      questionId: question.question_id,
      questionNo: question.question_no,
      title: `${question.question_no}번 유사답안`,
      text: (genPayload as { text: string }).text,
      sourceReason: reason,
    });
    setStatus("생성된 유사답안 기준을 확인 후 저장하세요.");
  }

  async function saveSimilarRubricDraft() {
    if (!similarRubricDraft) return;
    await saveSimilarAnswerAcrossGroup(similarRubricDraft.questionId, {
      title: similarRubricDraft.title,
      text: similarRubricDraft.text,
      source_reason: similarRubricDraft.sourceReason,
    });
    setStatus("인정 유사답안을 문항별 유사답안에 추가했습니다.");
    setSimilarRubricDraft(null);
    await refresh();
  }

  async function saveSimilarAnswerAcrossGroup(questionId: number, payload: { title: string; text: string; source_reason?: string }) {
    if (!selectedExamGroup) return;
    const original = questions.find((question) => question.id === questionId);
    for (const exam of selectedExamGroup.exams) {
      const targetQuestions = exam.id === selectedExam?.id ? questions : await fetchQuestionsForExam(exam.id);
      const targetQuestion = targetQuestions.find((question) => question.question_no === original?.question_no) ?? targetQuestions.find((question) => question.id === questionId);
      if (!targetQuestion) continue;
      const res = await fetch(`${API}/questions/${targetQuestion.id}/similar-answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
    }
  }

  function openAbsenceModal() {
    setAbsenceDraftStudentIds(students.filter((student) => student.is_absent).map((student) => student.id));
    setAbsenceModalOpen(true);
  }

  function toggleAbsenceDraft(studentId: number) {
    setAbsenceDraftStudentIds((ids) => ids.includes(studentId) ? ids.filter((id) => id !== studentId) : [...ids, studentId]);
  }

  async function saveAbsenceDraft() {
    if (!selectedGradingExam) return;
    const res = await fetch(`${API}/exams/${selectedGradingExam.id}/students/absences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ absent_student_ids: absenceDraftStudentIds })
    });
    if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
    setAbsenceModalOpen(false);
    setStatus(`미응시 학생 ${absenceDraftStudentIds.length}명을 저장했습니다. 답안 PDF가 이미 업로드되어 있다면 다시 업로드하세요.`);
    await refresh();
  }

  async function createSimilarAnswer(event: FormEvent<HTMLFormElement>, questionId: number) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await saveSimilarAnswerAcrossGroup(questionId, {
      title: String(form.get("title") ?? ""),
      text: String(form.get("text") ?? ""),
      source_reason: String(form.get("source_reason") ?? ""),
    });
    formElement.reset();
    setStatus("모든 반의 문항에 유사답안을 추가했습니다.");
    await refresh();
  }

  async function updateSimilarAnswer(event: FormEvent<HTMLFormElement>, question: Question, answer: SimilarAnswer) {
    event.preventDefault();
    if (!selectedExamGroup) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get("title") ?? ""),
      text: String(form.get("text") ?? ""),
      source_reason: String(form.get("source_reason") ?? ""),
    };
    for (const exam of selectedExamGroup.exams) {
      const targetQuestions = exam.id === selectedExam?.id ? questions : await fetchQuestionsForExam(exam.id);
      const targetQuestion = targetQuestions.find((item) => item.question_no === question.question_no);
      const targetAnswer = targetQuestion?.similar_answers.find((item) => item.id === answer.id) ?? targetQuestion?.similar_answers.find((item) => item.title === answer.title && item.text === answer.text);
      if (!targetAnswer) continue;
      const res = await fetch(`${API}/similar-answers/${targetAnswer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
    }
    setStatus("모든 반의 유사답안을 수정했습니다.");
    await refresh();
  }

  async function deleteSimilarAnswer(question: Question, answer: SimilarAnswer) {
    if (!selectedExamGroup || !window.confirm("이 유사답안을 삭제할까요?")) return;
    for (const exam of selectedExamGroup.exams) {
      const targetQuestions = exam.id === selectedExam?.id ? questions : await fetchQuestionsForExam(exam.id);
      const targetQuestion = targetQuestions.find((item) => item.question_no === question.question_no);
      const targetAnswer = targetQuestion?.similar_answers.find((item) => item.id === answer.id) ?? targetQuestion?.similar_answers.find((item) => item.title === answer.title && item.text === answer.text);
      if (!targetAnswer) continue;
      const res = await fetch(`${API}/similar-answers/${targetAnswer.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
    }
    setStatus("모든 반의 유사답안을 삭제했습니다.");
    await refresh();
  }

  async function deleteSelectedExam() {
    if (!selectedExamGroup) return;
    await deleteExamGroup(selectedExamGroup);
  }

  async function deleteExamGroup(group: ExamGroup) {
    const ok = window.confirm(`${formatExamGroupLabel(group)} 시험 전체를 삭제할까요?\n모든 반의 학생, 문항, 채점 결과, 업로드/처리 파일이 모두 삭제됩니다.`);
    if (!ok) return;
    for (const exam of group.exams) {
      const res = await fetch(`${API}/exams/${exam.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
    }
    if (selectedExamKey === group.key) setSelectedExamKey("");
    setSelectedGradingExamId(null);
    setSelectedResultsExamId(null);
    setExamDropdownOpen(false);
    setQuestionPdf(null);
    setAnswerPdf(null);
    setAnswerTemplatePdf(null);
    setAnswerTemplateUploaded(false);
    setReferenceImportResult(null);
    setSelection(null);
    setStatus("시험과 관련 파일을 삭제했습니다.");
    await refresh();
  }

  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedExamGroup) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      question_no: Number(form.get("question_no")),
      max_score: Number(form.get("max_score")),
      question_text: form.get("question_text"),
      model_answer: form.get("model_answer"),
      rubric_text: String(form.get("rubric_text") ?? "")
    };
    for (const exam of selectedExamGroup.exams) {
      await fetch(`${API}/exams/${exam.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    formElement.reset();
    setShowManualQuestionForm(false);
    setStatus("모든 반에 문항을 저장했습니다.");
    await refresh();
  }

  async function updateQuestion(event: FormEvent<HTMLFormElement>, questionId: number) {
    event.preventDefault();
    if (!selectedExamGroup) return;
    const form = new FormData(event.currentTarget);
    const original = questions.find((question) => question.id === questionId);
    const payload = {
      question_no: Number(form.get("question_no")),
      max_score: Number(form.get("max_score")),
      question_text: form.get("question_text"),
      model_answer: form.get("model_answer"),
      rubric_text: form.get("rubric_text")
    };
    for (const exam of selectedExamGroup.exams) {
      const targetQuestions = exam.id === selectedExam?.id ? questions : await fetchQuestionsForExam(exam.id);
      const targetQuestion = targetQuestions.find((question) => question.question_no === original?.question_no) ?? targetQuestions.find((question) => question.id === questionId);
      if (!targetQuestion) continue;
      const res = await fetch(`${API}/questions/${targetQuestion.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
    }
    setEditingQuestionId(null);
    setStatus("모든 반의 문항을 수정했습니다.");
    await refresh();
  }

  function getImagePoint(event: MouseEvent<HTMLDivElement>) {
    const image = imageRef.current;
    if (!image) return null;
    const bounds = image.getBoundingClientRect();
    const x = Math.max(0, Math.min(event.clientX - bounds.left, bounds.width));
    const y = Math.max(0, Math.min(event.clientY - bounds.top, bounds.height));
    return { x, y };
  }

  function startDrag(event: MouseEvent<HTMLDivElement>) {
    const point = getImagePoint(event);
    if (!point) return;
    setSelection(null);
    setDrag({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y });
  }

  function moveDrag(event: MouseEvent<HTMLDivElement>) {
    if (!drag) return;
    const point = getImagePoint(event);
    if (!point) return;
    setDrag({ ...drag, currentX: point.x, currentY: point.y });
  }

  function finishDrag() {
    if (!drag) return;
    const rect = makeRect(drag.startX, drag.startY, drag.currentX, drag.currentY);
    setDrag(null);
    if (rect.width >= 8 && rect.height >= 8) {
      setSelection(rect);
    }
  }

  async function saveDraggedRegion() {
    if (!selectedExamGroup || !regionQuestionId || !selection || !imageRef.current) return;
    const image = imageRef.current;
    const scaleX = image.naturalWidth / image.clientWidth;
    const scaleY = image.naturalHeight / image.clientHeight;
    const sourceQuestion = questions.find((item) => item.id === regionQuestionId);
    let saved: Region | null = null;
    for (const exam of selectedExamGroup.exams) {
      const targetQuestions = exam.id === selectedExam?.id ? questions : await fetchQuestionsForExam(exam.id);
      const targetQuestion = targetQuestions.find((item) => item.question_no === sourceQuestion?.question_no);
      if (!targetQuestion) continue;
      const res = await fetch(`${API}/exams/${exam.id}/regions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region_type: "question",
          question_id: targetQuestion.id,
          page_offset: previewPageOffset,
          x: selection.x * scaleX / 2,
          y: selection.y * scaleY / 2,
          width: selection.width * scaleX / 2,
          height: selection.height * scaleY / 2
        })
      });
      if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
      if (exam.id === selectedExam?.id) saved = await res.json() as Region;
    }
    setStatus(`${sourceQuestion?.question_no ?? saved?.question_id ?? regionQuestionId}번 문항 영역을 모든 반에 저장했습니다.`);
    setSelection(null);
    await refresh();
  }

  async function deleteRegion(region: Region) {
    const ok = window.confirm(`${questionNo(region.question_id)} 영역을 삭제할까요?`);
    if (!ok) return;
    const res = await fetch(`${API}/regions/${region.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
    setStatus(`${questionNo(region.question_id)} 영역을 삭제했습니다.`);
    await refresh();
  }

  async function runOcrAndGrade() {
    if (!selectedGradingExam || submissions.length === 0 || questions.length === 0) return;
    try {
      setGrading(true);
      setStatus("첫 학생의 전체 답안을 채점 중입니다...");
      const gradingQuestions = selectedGradingExam.id === selectedExam?.id ? questions : await fetchQuestionsForExam(selectedGradingExam.id);
      if (gradingQuestions.length === 0) throw new Error("채점할 문항이 없습니다.");
      const firstSubmission = submissions[0];
      setGradingProgress({ done: 0, total: gradingQuestions.length, label: `${firstSubmission.student_no} ${firstSubmission.student_name} OCR 중` });
      const ocrRes = await fetch(`${API}/submissions/${firstSubmission.id}/ocr`, { method: "POST" });
      if (!ocrRes.ok) {
        throw new Error(`AI image interpretation failed: ${await ocrRes.text()}`);
      }
      let done = 0;
      for (const question of gradingQuestions) {
        setGradingProgress({ done, total: gradingQuestions.length, label: `${firstSubmission.student_no} ${firstSubmission.student_name} / ${question.question_no}번 채점 중` });
        const gradeRes = await fetch(`${API}/grade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submission_id: firstSubmission.id, question_id: question.id })
        });
        if (!gradeRes.ok) {
          throw new Error(`Grading failed: ${await gradeRes.text()}`);
        }
        done += 1;
        setGradingProgress({ done, total: gradingQuestions.length, label: `${question.question_no}번 채점 완료` });
      }
      setStatus(`첫 학생 전체 답안 채점 완료: ${done}/${gradingQuestions.length}`);
      await refresh();
    } catch (error) {
      setStatus(`오류: ${error instanceof Error ? error.message : String(error)}`);
      console.error(error);
    } finally {
      setGrading(false);
    }
  }

  function validateGradingReady(): string | null {
    if (!selectedGradingExam) return "시험/반을 먼저 선택하세요.";
    if (students.filter((student) => !student.is_absent).length === 0) return "응시 학생이 없습니다.";
    const absentWithSubmission = students.some((student) => student.is_absent && submissions.some((submission) => submission.student_id === student.id || submission.student_no === student.student_no));
    if (absentWithSubmission) return "미응시 설정이 바뀌었습니다. 답안 PDF를 다시 업로드하세요.";
    if (submissions.length === 0) return "학생 답안 PDF를 먼저 업로드하세요.";
    if (questions.length === 0) return "문항을 먼저 등록하세요.";
    const missing = questions.filter((question) => !regions.some((region) => region.question_id === question.id && region.region_type === "question"));
    if (missing.length > 0) return `문항 영역 미설정: ${missing.map((question) => `${question.question_no}번`).join(", ")}`;
    return null;
  }

  async function validateExamGradingReady(exam: Exam): Promise<string | null> {
    const [examQuestions, examStudents, examSubmissions, examRegions] = await Promise.all([
      fetchQuestionsForExam(exam.id),
      fetchJson<Student[]>(`/exams/${exam.id}/students`),
      fetchJson<Submission[]>(`/exams/${exam.id}/submissions`),
      fetchJson<Region[]>(`/exams/${exam.id}/regions`)
    ]);
    const presentCount = examStudents.filter((student) => !student.is_absent).length;
    if (presentCount === 0) return "응시 학생이 없습니다.";
    const absentWithSubmission = examStudents.some((student) => student.is_absent && examSubmissions.some((submission) => submission.student_id === student.id || submission.student_no === student.student_no));
    if (absentWithSubmission) return "미응시 설정이 바뀌었습니다. 답안 PDF를 다시 업로드하세요.";
    if (examSubmissions.length === 0) return "학생 답안 PDF를 먼저 업로드하세요.";
    if (examQuestions.length === 0) return "문항을 먼저 등록하세요.";
    const missing = examQuestions.filter((question) => !examRegions.some((region) => region.question_id === question.id && region.region_type === "question"));
    if (missing.length > 0) return `문항 영역 미설정: ${missing.map((question) => `${question.question_no}번`).join(", ")}`;
    return null;
  }

  async function runAllGrading() {
    const validationError = validateGradingReady();
    if (validationError) {
      setStatus(`오류: ${validationError}`);
      return;
    }
    setGrading(true);
    setFailedGradingItems([]);
    const total = submissions.length * questions.length;
    let done = 0;
    const failures: FailedGradingItem[] = [];
    setGradingProgress({ done, total, label: "전체 채점 시작" });
    for (const submission of submissions) {
      const studentLabel = `${submission.student_no} ${submission.student_name}`;
      setGradingProgress({ done, total, label: `${studentLabel} OCR 중` });
      let ocrOk = true;
      try {
        const ocrRes = await fetch(`${API}/submissions/${submission.id}/ocr`, { method: "POST" });
        if (!ocrRes.ok) throw new Error(formatApiError(await readApiPayload(ocrRes)));
      } catch (error) {
        ocrOk = false;
        const message = error instanceof Error ? error.message : String(error);
        for (const question of questions) {
          failures.push({
            submission_id: submission.id,
            question_id: question.id,
            student_label: studentLabel,
            question_label: `${question.question_no}번`,
            stage: "ocr",
            error: message,
          });
          done += 1;
        }
        setFailedGradingItems([...failures]);
        setGradingProgress({ done, total, label: `${studentLabel} OCR 실패, 다음 학생으로 진행` });
      }
      if (!ocrOk) continue;

      for (const question of questions) {
        setGradingProgress({ done, total, label: `${studentLabel} / ${question.question_no}번 채점 중` });
        try {
          const gradeRes = await fetch(`${API}/grade`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submission_id: submission.id, question_id: question.id })
          });
          if (!gradeRes.ok) throw new Error(formatApiError(await readApiPayload(gradeRes)));
        } catch (error) {
          failures.push({
            submission_id: submission.id,
            question_id: question.id,
            student_label: studentLabel,
            question_label: `${question.question_no}번`,
            stage: "grade",
            error: error instanceof Error ? error.message : String(error),
          });
          setFailedGradingItems([...failures]);
        }
        done += 1;
        setGradingProgress({ done, total, label: `${studentLabel} / ${question.question_no}번 처리 완료` });
      }
    }
    setStatus(failures.length > 0 ? `전체 채점 완료: ${done}/${total}, 실패 ${failures.length}건` : `전체 채점 완료: ${done}/${total}`);
    setActiveTab(failures.length > 0 ? "grading" : "results");
    await refresh();
    setGrading(false);
  }

  async function startGradingJob(force = false) {
    const validationError = validateGradingReady();
    if (validationError) {
      setStatus(`오류: ${validationError}`);
      return;
    }
    if (!selectedGradingExam) return;
    setGrading(true);
    setFailedGradingItems([]);
    setGradingProgress({ done: 0, total: submissions.length * questions.length, label: force ? "전체 채점 시작" : "미채점만 채점 시작" });
    const res = await fetch(`${API}/exams/${selectedGradingExam.id}/grading-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force })
    });
    const payload = await readApiPayload(res);
    if (!res.ok) throw new Error(formatApiError(payload));
    const job = payload as GradingJob;
    setActiveGradingJobs([{ ...job, class_name: selectedGradingExam.class_name }]);
    setStatus(`채점 작업을 시작했습니다: ${job.job_id}`);
  }

  async function startAllClassGradingJobs(force = false) {
    if (!selectedExamGroup) return;
    setGrading(true);
    setFailedGradingItems([]);
    setActiveGradingJobs([]);
    const readyExams: Exam[] = [];
    const skipped: string[] = [];
    for (const exam of selectedExamGroup.exams) {
      const validationError = await validateExamGradingReady(exam);
      if (validationError) {
        skipped.push(`${classShortLabel(exam.class_name)}: ${validationError}`);
      } else {
        readyExams.push(exam);
      }
    }
    if (readyExams.length === 0) {
      setGrading(false);
      setStatus(`오류: 채점 가능한 반이 없습니다. ${skipped.join(" / ")}`);
      return;
    }
    setGradingProgress({ done: 0, total: 0, label: `${readyExams.length}개 반 동시 채점 시작` });
    const jobs = await Promise.all(readyExams.map(async (exam) => {
      const res = await fetch(`${API}/exams/${exam.id}/grading-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force })
      });
      const payload = await readApiPayload(res);
      if (!res.ok) throw new Error(`${classShortLabel(exam.class_name)}: ${formatApiError(payload)}`);
      return { ...(payload as GradingJob), class_name: exam.class_name };
    }));
    setActiveGradingJobs(jobs);
    setStatus(`${jobs.length}개 반 채점 작업을 동시에 시작했습니다.${skipped.length > 0 ? ` 제외: ${skipped.join(" / ")}` : ""}`);
  }

  async function startQuestionRegrade() {
    if (!selectedGradingExam || !regradeQuestionId) return;
    const question = questions.find((item) => item.id === regradeQuestionId);
    const gradingQuestions = selectedGradingExam.id === selectedExam?.id ? questions : await fetchQuestionsForExam(selectedGradingExam.id);
    const targetQuestion = gradingQuestions.find((item) => item.question_no === question?.question_no);
    if (!targetQuestion) {
      setStatus("오류: 선택한 반에서 해당 문항을 찾을 수 없습니다.");
      return;
    }
    const ok = window.confirm(`${question?.question_no ?? regradeQuestionId}번 문항의 기존 OCR/채점 결과와 표시 위치를 삭제하고 이 문항만 다시 채점할까요?`);
    if (!ok) return;
    setGrading(true);
    setFailedGradingItems([]);
    setGradingProgress({ done: 0, total: submissions.length, label: `${question?.question_no ?? "선택"}번 문항 재채점 시작` });
    const res = await fetch(`${API}/exams/${selectedGradingExam.id}/questions/${targetQuestion.id}/regrade-job`, { method: "POST" });
    const payload = await readApiPayload(res);
    if (!res.ok) throw new Error(formatApiError(payload));
    const job = payload as GradingJob;
    setActiveGradingJobs([{ ...job, class_name: selectedGradingExam.class_name }]);
    setStatus(`${question?.question_no ?? regradeQuestionId}번 문항 재채점을 시작했습니다.`);
  }

  async function deleteCurrentGradingResults() {
    if (!selectedGradingExam) return;
    const ok = window.confirm("현재 선택한 시험/반의 모든 OCR, 채점 결과, 교사 수정 점수, 표시 위치를 삭제할까요?\n학생 명단, 문항, 답안 PDF, 영역 설정은 유지됩니다.");
    if (!ok) return;
    const res = await fetch(`${API}/exams/${selectedGradingExam.id}/grading-results`, { method: "DELETE" });
    if (!res.ok) throw new Error(formatApiError(await readApiPayload(res)));
    setGradingProgress({ done: 0, total: 0, label: "" });
    setFailedGradingItems([]);
    setSelectedResult(null);
    setStatus("현재 채점결과를 삭제했습니다.");
    await refresh();
  }

  async function retryFailedGradingItems() {
    if (failedGradingItems.length === 0) return;
    setGrading(true);
    const retryTargets = [...failedGradingItems];
    const remaining: FailedGradingItem[] = [];
    let done = 0;
    setGradingProgress({ done, total: retryTargets.length, label: "실패 항목 재시도 시작" });
    for (const item of retryTargets) {
      setGradingProgress({ done, total: retryTargets.length, label: `${item.student_label} / ${item.question_label} 재시도 중` });
      try {
        if (item.stage === "ocr") {
          const ocrRes = await fetch(`${API}/submissions/${item.submission_id}/ocr`, { method: "POST" });
          if (!ocrRes.ok) throw new Error(formatApiError(await readApiPayload(ocrRes)));
        }
        if (item.question_id !== null) {
          const gradeRes = await fetch(`${API}/grade`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submission_id: item.submission_id, question_id: item.question_id })
          });
          if (!gradeRes.ok) throw new Error(formatApiError(await readApiPayload(gradeRes)));
        }
      } catch (error) {
        remaining.push({ ...item, stage: item.question_id ? "grade" : item.stage, error: error instanceof Error ? error.message : String(error) });
      }
      done += 1;
      setFailedGradingItems([...remaining]);
      setGradingProgress({ done, total: retryTargets.length, label: `${item.student_label} / ${item.question_label} 재시도 완료` });
    }
    setFailedGradingItems(remaining);
    setStatus(remaining.length > 0 ? `재시도 완료, 실패 ${remaining.length}건 남음` : "실패 항목 재시도 완료");
    await refresh();
    setGrading(false);
  }

  function regionBoxStyle(region: Region) {
    if (!previewImageSize) return undefined;
    const scaleX = previewImageSize.displayWidth / (previewImageSize.width / 2);
    const scaleY = previewImageSize.displayHeight / (previewImageSize.height / 2);
    return {
      left: region.x * scaleX,
      top: region.y * scaleY,
      width: region.width * scaleX,
      height: region.height * scaleY
    };
  }

  function resultRegionBoxStyle(region: Region) {
    if (!resultPreviewSize) return undefined;
    const scaleX = resultPreviewSize.displayWidth / (resultPreviewSize.width / 2);
    const scaleY = resultPreviewSize.displayHeight / (resultPreviewSize.height / 2);
    return {
      left: region.x * scaleX,
      top: region.y * scaleY,
      width: region.width * scaleX,
      height: region.height * scaleY
    };
  }

  function templateRegionBoxStyle(region: DetectedRegion, kind: "expanded" | "detected" = "expanded") {
    if (!templatePreviewSize) return undefined;
    const scaleX = templatePreviewSize.displayWidth / (templatePreviewSize.width / 2);
    const scaleY = templatePreviewSize.displayHeight / (templatePreviewSize.height / 2);
    const source = kind === "expanded"
      ? { x: region.x, y: region.y, width: region.width, height: region.height }
      : { x: region.detected_x, y: region.detected_y, width: region.detected_width, height: region.detected_height };
    return {
      left: source.x * scaleX,
      top: source.y * scaleY,
      width: source.width * scaleX,
      height: source.height * scaleY
    };
  }

  function updateDetectedRegion(index: number, patch: Partial<DetectedRegion>) {
    setDetectedRegions((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function questionNo(questionId: number | null): string {
    const question = questions.find((item) => item.id === questionId);
    if (question) return `${question.question_no}번`;
    const resultQuestion = resultQuestionOptions.find((item) => item.question_id === questionId);
    return resultQuestion ? `${resultQuestion.question_no}번` : "문항 없음";
  }

  function chooseResult(submissionId: number, questionId: number) {
    setSelectedResult({ submissionId, questionId });
  }

  function moveSelectedResult(studentDelta: number, questionDelta: number) {
    if (!selectedResult || results.length === 0) return;
    const currentStudentIndex = selectedResultStudentIndex >= 0 ? selectedResultStudentIndex : 0;
    const nextStudentIndex = Math.max(0, Math.min(results.length - 1, currentStudentIndex + studentDelta));
    const nextSubmission = results[nextStudentIndex];
    const currentQuestionIndex = selectedResultQuestionIndex >= 0 ? selectedResultQuestionIndex : 0;
    const nextQuestionIndex = Math.max(0, Math.min(nextSubmission.questions.length - 1, currentQuestionIndex + questionDelta));
    const nextQuestion = nextSubmission.questions[nextQuestionIndex];
    if (nextQuestion) setSelectedResult({ submissionId: nextSubmission.submission_id, questionId: nextQuestion.question_id });
  }

  function selectStudentInResults(submissionId: number) {
    const submission = results.find((item) => item.submission_id === submissionId);
    if (!submission) return;
    const currentQuestionId = selectedResult?.questionId;
    const question = submission.questions.find((item) => item.question_id === currentQuestionId) ?? submission.questions[0];
    if (question) chooseResult(submission.submission_id, question.question_id);
  }

  function selectQuestionInResults(questionId: number) {
    const submission = selectedResultSubmission ?? results[0];
    if (!submission) return;
    chooseResult(submission.submission_id, questionId);
  }

  function updateAnswerMagnifier(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height));
    const lensRadius = ANSWER_MAGNIFIER_SIZE / 2;
    setAnswerMagnifier({
      visible: true,
      x,
      y,
      backgroundX: lensRadius - x * ANSWER_MAGNIFIER_ZOOM,
      backgroundY: lensRadius - y * ANSWER_MAGNIFIER_ZOOM,
      backgroundWidth: rect.width * ANSWER_MAGNIFIER_ZOOM,
      backgroundHeight: rect.height * ANSWER_MAGNIFIER_ZOOM,
    });
  }

  function hideAnswerMagnifier() {
    setAnswerMagnifier((value) => ({ ...value, visible: false }));
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="title-row">
          <h1>서술형 답안 채점 프로그램</h1>
          <span className="current-exam-badge">현재 시험 : {selectedExamGroup ? formatExamGroupLabel(selectedExamGroup) : "선택된 시험 없음"}</span>
        </div>
      </section>

      <section className="workspace">
        <div className="nav-status-row">
          <div className="tabs">
            <button type="button" className={activeTab === "setup" ? "active" : ""} onClick={() => setActiveTab("setup")}>시험생성</button>
            <button type="button" className={activeTab === "questions" ? "active" : ""} onClick={() => setActiveTab("questions")}>채점기준 관리</button>
            <button type="button" className={activeTab === "regions" ? "active" : ""} onClick={() => setActiveTab("regions")}>영역 설정</button>
            <button type="button" className={activeTab === "grading" ? "active" : ""} onClick={() => setActiveTab("grading")}>채점 실행</button>
            <button type="button" className={activeTab === "results" ? "active" : ""} onClick={() => setActiveTab("results")}>결과/검토</button>
          </div>
          <p className="notice status-chip">상태: {status}</p>
        </div>

        {activeTab === "setup" && <div className="tab-panel two-column">
          <form className="card form" onSubmit={createExam}>
            <h2>시험 생성</h2>
            <div className="dual-input-row">
              <label>시험명<input name="name" required placeholder="1학기 중간고사" /></label>
              <label>과목<input name="subject" required placeholder="수학" /></label>
            </div>
            <div className="triple-input-row">
              <label>학년<input name="grade" type="number" min="1" defaultValue="2" required /></label>
              <label>시작 반<input name="class_start" type="number" min="1" defaultValue="1" required /></label>
              <label>끝 반<input name="class_end" type="number" min="1" defaultValue="3" required /></label>
            </div>
            <div className="inline-submit-row">
              <label>학생당 페이지 수<select name="pages_per_student" defaultValue="4" required>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((pageCount) => <option key={pageCount} value={pageCount}>{pageCount}쪽</option>)}
              </select></label>
              <label className={`formula-toggle ${formulaRecognitionDraft ? "is-on" : "is-off"}`}>
                <input name="formula_recognition_enabled" type="checkbox" checked={formulaRecognitionDraft} onChange={(event) => setFormulaRecognitionDraft(event.target.checked)} />
                <span>수식</span>
                <span className="formula-state">{formulaRecognitionDraft ? "ON" : "OFF"}</span>
              </label>
              <button>시험 만들기</button>
            </div>
          </form>

          <div className="card stack current-exam-card">
            <h2>현재 시험</h2>
            {exams.length === 0 ? <p className="muted">아직 시험이 없습니다.</p> : (
              <div className="exam-combo">
                <button className="exam-combo-trigger" type="button" onClick={() => setExamDropdownOpen((value) => !value)}>
                  <span>{selectedExamGroup ? formatExamGroupLabel(selectedExamGroup) : "시험 선택"}</span>
                  <span aria-hidden="true">▾</span>
                </button>
                {examDropdownOpen && (
                  <div className="exam-combo-menu">
                    {examGroups.map((group) => (
                      <div className={`exam-combo-item ${group.key === selectedExamGroup?.key ? "active" : ""}`} key={group.key}>
                        <button type="button" className="exam-combo-select" onClick={() => {
                          setSelectedExamKey(group.key);
                          setExamDropdownOpen(false);
                        }}>{formatExamGroupLabel(group)}</button>
                        <button className="mini-danger exam-combo-delete" type="button" onClick={async (event) => {
                          event.stopPropagation();
                          try {
                            await deleteExamGroup(group);
                          } catch (err) {
                            setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                          }
                        }}>삭제</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>}

        {activeTab === "questions" && <div className="tab-panel questions-management-grid">
          <div className="card stack reference-import-card">
            <div className="reference-import-box">
              <h2>채점기준 자동 설정</h2>
              <div className="stacked-file-inputs">
                <div className="custom-file-row">
                  <span>문제 PDF</span>
                  <label className="file-picker-button">파일 선택<input type="file" accept=".pdf" onChange={(e) => setQuestionPdf(e.target.files?.[0] ?? null)} /></label>
                  <span className="selected-file-name">{questionPdf?.name ?? "선택된 파일 없음"}</span>
                </div>
                <div className="custom-file-row">
                  <span>채점기준표 PDF</span>
                  <label className="file-picker-button">파일 선택<input type="file" accept=".pdf" onChange={(e) => setAnswerPdf(e.target.files?.[0] ?? null)} /></label>
                  <span className="selected-file-name">{answerPdf?.name ?? "선택된 파일 없음"}</span>
                </div>
              </div>
              <div className="actions">
                <button type="button" onClick={async () => {
                  try {
                    await importReferencePdfs();
                  } catch (err) {
                    setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }} disabled={!selectedExamGroup || (!questionPdf && !answerPdf)}>문항 자동 입력</button>
                <button type="button" className="secondary" onClick={() => setShowManualQuestionForm((value) => !value)}>{showManualQuestionForm ? "수동 입력 닫기" : "수동으로 문항 추가"}</button>
              </div>
              {referenceImportResult && (
                <div className="notice">
                  <strong>자동 입력 결과</strong>
                  <p>{referenceImportResult.imported_count}개 문항을 저장했습니다.</p>
                  <ul className="compact-list">
                    {referenceImportResult.questions.map((question) => (
                      <li key={question.id}>{question.question_no}번 / {question.max_score}점</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {showManualQuestionForm && <form className="form" onSubmit={createQuestion}>
            <h2>문항/채점기준</h2>
            <div className="actions">
              <label>문항 번호<input name="question_no" type="number" min="1" required /></label>
              <label>배점<input name="max_score" type="number" min="0" step="0.5" required /></label>
            </div>
            <label>문제 원문<textarea name="question_text" /></label>
            <label>모범답안<textarea name="model_answer" /></label>
            <label>단계별 채점 기준<textarea name="rubric_text" defaultValue={RUBRIC_STEP_TEMPLATE} /></label>
            <button>문항 저장</button>
          </form>}
          </div>

          <div className="card stack registered-questions-card">
            <h2>등록된 문항</h2>
            {questions.length === 0 ? <p className="muted">아직 문항이 없습니다.</p> : (
              <div className="list">
                {questions.map((question) => (
                  <div className="row question-row" key={question.id}>
                    {editingQuestionId === question.id ? (
                      <>
                        <form className="inline-edit form" onSubmit={async (event) => {
                          try {
                            await updateQuestion(event, question.id);
                          } catch (err) {
                            setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                          }
                        }}>
                          <div className="actions">
                            <label>문항 번호<input name="question_no" type="number" min="1" defaultValue={question.question_no} required /></label>
                            <label>배점<input name="max_score" type="number" min="0" step="0.5" defaultValue={question.max_score} required /></label>
                          </div>
                          <label>문제 원문<textarea name="question_text" defaultValue={question.question_text} /></label>
                          <label>모범답안<textarea name="model_answer" defaultValue={question.model_answer} /></label>
                          <label>단계별 채점 기준<textarea name="rubric_text" defaultValue={question.rubric_text || RUBRIC_STEP_TEMPLATE} /></label>
                          <div className="actions">
                            <button type="submit">저장</button>
                            <button type="button" className="secondary" onClick={() => setEditingQuestionId(null)}>취소</button>
                          </div>
                        </form>
                        <SimilarAnswerEditor question={question} onCreate={createSimilarAnswer} onUpdate={updateSimilarAnswer} onDelete={deleteSimilarAnswer} />
                      </>
                    ) : (
                      <>
                        <div className="actions space-between full-width">
                          <span>{question.question_no}번 / {question.max_score}점</span>
                          <div className="actions">
                            <button type="button" className="secondary" onClick={() => setSelectedQuestionDetailId(question.id)}>보기</button>
                            <button type="button" className="secondary" onClick={() => setEditingQuestionId(question.id)}>수정</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card stack question-detail-pane">
            <h2>문항 정보</h2>
            {!selectedQuestionDetail ? <p className="muted">문항을 선택하세요.</p> : <>
              <strong>{selectedQuestionDetail.question_no}번 / {selectedQuestionDetail.max_score}점</strong>
              <p className="muted clamp-2">문제: {selectedQuestionDetail.question_text || "문제 원문 없음"}</p>
              <p className="muted clamp-2">모범답안: {selectedQuestionDetail.model_answer || "모범답안 없음"}</p>
              <div className="rubric-preview">
                {parseRubricSteps(selectedQuestionDetail.rubric_text).map((step) => (
                  <span className="step-chip" key={`${selectedQuestionDetail.id}-${step.name}`}>{step.name}{step.points ? ` ${step.points}점` : ""}</span>
                ))}
                {parseRubricSteps(selectedQuestionDetail.rubric_text).length === 0 && <span className="muted">채점기준 없음</span>}
              </div>
              <pre className="rubric-full-text">{selectedQuestionDetail.rubric_text}</pre>
              <SimilarAnswerList answers={selectedQuestionDetail.similar_answers ?? []} />
            </>}
          </div>

        </div>}

        {activeTab === "regions" && <div className="tab-panel two-column regions-split">
          <div className="card stack">
            <h2>빈 답안 양식 자동 인식</h2>
            <div className="template-upload-grid">
              <label>빈 답안 양식 PDF<input type="file" accept=".pdf" onChange={(event) => setAnswerTemplatePdf(event.target.files?.[0] ?? null)} /></label>
            </div>
            <div className="actions template-action-row">
              <button type="button" onClick={async () => {
                try {
                  await uploadAnswerTemplate();
                } catch (err) {
                  setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                }
              }} disabled={!selectedExamGroup || !answerTemplatePdf}>양식 업로드</button>
              <button type="button" className="secondary" onClick={async () => {
                try {
                  await autoDetectTemplateRegions();
                } catch (err) {
                  setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                }
              }} disabled={!selectedExam}>자동 인식</button>
              {detectedRegions.length > 0 && <button type="button" className="template-save-button" onClick={async () => {
                try {
                  await saveDetectedRegions();
                } catch (err) {
                  setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                }
              }}>수정된 자동 인식 영역 저장</button>}
            </div>
            <div className="notice">점선은 AI가 찾은 원래 칸, 실선은 여유를 넓혀 실제 저장할 영역입니다. 저장 전에 문항과 페이지를 확인할 수 있습니다.</div>
            <div className="template-workspace">
              <div>
                <div className="result-preview-frame">
                  {answerTemplateUploaded && templatePreviewUrl ? (
                    <img src={templatePreviewUrl} alt="빈 답안 양식 미리보기" draggable={false} onLoad={(event) => {
                      setTemplatePreviewSize({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                        displayWidth: event.currentTarget.clientWidth,
                        displayHeight: event.currentTarget.clientHeight
                      });
                    }} />
                  ) : (
                    <p className="notice preview-placeholder">빈 답안 양식 PDF를 업로드하면 미리보기가 표시됩니다.</p>
                  )}
                  {detectedRegions.filter((item) => item.page_offset === templatePageOffset).map((region, index) => {
                    const detectedStyle = templateRegionBoxStyle(region, "detected");
                    const expandedStyle = templateRegionBoxStyle(region, "expanded");
                    return (
                      <div key={`${region.question_id}-${index}`}>
                        {detectedStyle && <div className="template-box detected" style={detectedStyle} />}
                        {expandedStyle && <div className={`template-box expanded ${region.confidence < 0.75 ? "low-confidence" : ""}`} style={expandedStyle}>
                          <span>{region.question_no ?? questionNo(region.question_id)}</span>
                        </div>}
                      </div>
                    );
                  })}
                </div>
                <label className="template-page-control">양식 페이지<input type="number" min="1" value={templatePageOffset + 1} onChange={(event) => setTemplatePageOffset(Math.max(0, Number(event.target.value) - 1))} /></label>
              </div>
              <div className="list">
                {detectedRegions.length === 0 ? <p className="muted">자동 인식 결과가 아직 없습니다.</p> : detectedRegions.map((region, index) => (
                  <div className="row question-row detected-region-row" key={`detected-${index}`}>
                    <div className="actions space-between full-width">
                      <strong>{region.question_no ?? "?"}번 / 신뢰도 {region.confidence.toFixed(2)}</strong>
                      <button type="button" className="mini-danger" onClick={() => setDetectedRegions((items) => items.filter((_, itemIndex) => itemIndex !== index))}>삭제</button>
                    </div>
                    <div className="actions region-edit-grid compact-region-edit detected-region-edit-grid">
                      <label>문항<select value={region.question_id ?? ""} onChange={(event) => {
                        const question = questions.find((item) => item.id === Number(event.target.value));
                        updateDetectedRegion(index, { question_id: question?.id ?? null, question_no: question?.question_no ?? null });
                      }}>
                        <option value="">문항 선택</option>
                        {questions.map((question) => <option key={question.id} value={question.id}>{question.question_no}번</option>)}
                      </select></label>
                      <label>페이지<input type="number" min="1" value={region.page_offset + 1} onChange={(event) => updateDetectedRegion(index, { page_offset: Math.max(0, Number(event.target.value) - 1) })} /></label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card form">
            <div className="section-heading-row">
              <h2>문항 영역 드래그</h2>
              <div className="actions compact-region-controls">
              <label>문항<select value={regionQuestionId ?? ""} onChange={(event) => setRegionQuestionId(Number(event.target.value))}>
                {questions.map((q) => <option key={q.id} value={q.id}>{q.question_no}번</option>)}
              </select></label>
              <label>페이지<input value={previewPageOffset + 1} type="number" min="1" max={selectedExam?.pages_per_student ?? 1} onChange={(event) => {
                setPreviewPageOffset(Math.max(0, Number(event.target.value) - 1));
                setSelection(null);
              }} /></label>
              </div>
            </div>
            {selectedSavedRegion ? (
              <div className="region-status-row">
                <p className="notice">현재 선택한 {questionNo(selectedSavedRegion.question_id)} 영역 저장됨: p.{selectedSavedRegion.page_offset + 1}</p>
                <button type="button" onClick={async () => {
                  try {
                    await saveDraggedRegion();
                  } catch (err) {
                    setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }} disabled={!selection || !regionQuestionId}>드래그 영역 저장</button>
              </div>
            ) : (
              <div className="region-status-row">
                <p className="notice">현재 선택한 문항은 이 페이지에 저장된 영역이 없습니다.</p>
                <button type="button" onClick={async () => {
                  try {
                    await saveDraggedRegion();
                  } catch (err) {
                    setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }} disabled={!selection || !regionQuestionId}>드래그 영역 저장</button>
              </div>
            )}
            <div className="drag-workspace">
              {!dragTemplatePreviewUrl ? <p className="notice">빈 답안 양식 PDF 업로드 후 미리보기가 표시됩니다.</p> : (
                <div className="preview-frame drag-preview-frame" onMouseDown={startDrag} onMouseMove={moveDrag} onMouseUp={finishDrag} onMouseLeave={finishDrag}>
                  <img ref={imageRef} src={dragTemplatePreviewUrl} alt="빈 답안 양식 문항 영역 미리보기" draggable={false} onLoad={(event) => {
                    setPreviewImageSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                      displayWidth: event.currentTarget.clientWidth,
                      displayHeight: event.currentTarget.clientHeight
                    });
                  }} />
                  {savedRegionsForPage.map((region) => {
                    const style = regionBoxStyle(region);
                    if (!style) return null;
                    return (
                      <div className={`saved-region-box ${region.question_id === regionQuestionId ? "active" : ""}`} key={region.id} style={style}>
                        <span>{questionNo(region.question_id)}</span>
                      </div>
                    );
                  })}
                  {activeRect && <div className="selection-box" style={{ left: activeRect.x, top: activeRect.y, width: activeRect.width, height: activeRect.height }} />}
                </div>
              )}
              <div className="region-list">
                <strong>저장된 문항 영역</strong>
                {questions.length === 0 ? <p className="muted">문항을 먼저 등록하세요.</p> : (
                  <div className="list compact-region-list">
                    {regions.filter((item) => item.region_type === "question").map((region) => (
                      <div className="row compact-row tight-region-row" key={region.id}>
                        <span>{questionNo(region.question_id)} / p.{region.page_offset + 1}</span>
                        <button className="mini-danger" type="button" onClick={async () => {
                          try {
                            await deleteRegion(region);
                          } catch (err) {
                            setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                          }
                        }}>삭제</button>
                      </div>
                    ))}
                    {questions.filter((question) => !regions.some((item) => item.question_id === question.id && item.region_type === "question")).map((question) => (
                      <div className="row compact-row tight-region-row" key={`missing-${question.id}`}>
                        <span>{question.question_no}번</span>
                        <span className="pill missing">미설정</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {selection && <p className="muted">선택 크기: {Math.round(selection.width)} x {Math.round(selection.height)} px</p>}
          </div>

        </div>}

        {activeTab === "grading" && <div className="tab-panel two-column">
          <div className="card stack">
            <div className="section-heading-row">
              <h2>채점 실행</h2>
              <label className="compact-select-label">반 선택<select value={selectedGradingExam?.id ?? ""} onChange={(event) => setSelectedGradingExamId(Number(event.target.value))}>
                {selectedExamGroup?.exams.map((exam) => <option key={exam.id} value={exam.id}>{classShortLabel(exam.class_name)}</option>)}
              </select></label>
            </div>
            <div className="upload-panel">
              <h2>파일 업로드</h2>
              <div className="upload-file-grid">
                <label>학생 명단 Excel<input type="file" accept=".xlsx" onChange={(e) => setStudentListFile(e.target.files?.[0] ?? null)} /></label>
                <button type="button" onClick={async () => {
                  try {
                    if (!selectedGradingExam) return;
                    await uploadFile(`/exams/${selectedGradingExam.id}/students/import`, "file", studentListFile);
                    setStatus(`${selectedGradingExam.class_name} 학생 명단을 불러왔습니다.`);
                    setStudentListFile(null);
                    await refresh();
                  } catch (err) { setStatus(String(err)); }
                }} disabled={!selectedGradingExam || !studentListFile}>업로드</button>
                <label>반 전체 답안 PDF<input type="file" accept=".pdf" onChange={(e) => setStudentAnswersPdf(e.target.files?.[0] ?? null)} /></label>
                <button type="button" onClick={async () => {
                  try {
                    if (!selectedGradingExam) return;
                    await uploadAnswersPdfWithIgnorePrompt(studentAnswersPdf);
                  } catch (err) { setStatus(String(err)); }
                }} disabled={!selectedGradingExam || !studentAnswersPdf}>업로드</button>
              </div>
            </div>
            <div className="grading-controls">
              <div className="actions grading-control-row">
                <button onClick={runOcrAndGrade} disabled={grading}>첫 학생 테스트</button>
              <button onClick={async () => {
                try {
                  await startGradingJob(true);
                } catch (err) {
                  setGrading(false);
                  setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                }
              }} disabled={grading}>전체 채점</button>
              <button onClick={async () => {
                try {
                  await startAllClassGradingJobs(true);
                } catch (err) {
                  setGrading(false);
                  setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                }
              }} disabled={grading || !selectedExamGroup}>모든 반 동시 채점</button>
                <button className="danger" type="button" onClick={async () => {
                  try {
                    await deleteCurrentGradingResults();
                  } catch (err) {
                    setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }} disabled={grading}>채점결과 삭제</button>
              </div>
              <div className="actions grading-control-row">
              <button className="secondary" onClick={async () => {
                try {
                  await startGradingJob(false);
                } catch (err) {
                  setGrading(false);
                  setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                }
              }} disabled={grading}>미채점만 채점</button>
              <button className="secondary" onClick={async () => {
                try {
                  await startAllClassGradingJobs(false);
                } catch (err) {
                  setGrading(false);
                  setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                }
              }} disabled={grading || !selectedExamGroup}>모든 반 미채점만</button>
              <button className="secondary" type="button" onClick={async () => {
                try {
                  await startQuestionRegrade();
                } catch (err) {
                  setGrading(false);
                  setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                }
              }} disabled={grading || !regradeQuestionId}>문항별 재채점</button>
                <select className="regrade-select" value={regradeQuestionId ?? ""} onChange={(event) => setRegradeQuestionId(Number(event.target.value))}>
                  <option value="">문항 선택</option>
                  {questions.map((question) => <option key={question.id} value={question.id}>{question.question_no}번</option>)}
                </select>
              </div>
              {selectedGradingExam && <a className="button-link secondary excel-download-link" href={`${API}/exams/${selectedGradingExam.id}/export/scores`}>결과 Excel 다운로드</a>}
            </div>
            {gradingProgress.total > 0 && (
              <div className="notice">
                <strong>진행률 {gradingProgress.done} / {gradingProgress.total}</strong>
                <p>{gradingProgress.label}</p>
                <progress value={gradingProgress.done} max={gradingProgress.total} />
                {activeGradingJobs.length > 0 && <div className="list">
                  {activeGradingJobs.map((job) => (
                    <div className="row question-row grading-job-row" key={job.job_id}>
                      <div className="grading-job-topline">
                        <span>{classShortLabel(job.class_name)} : {job.status} ({job.done}/{job.total})</span>
                        <span className="muted grading-job-current">{job.label}</span>
                      </div>
                      <span className="muted">검토 {job.review_needed_count}건 / 실패 {job.failed_items.length}건</span>
                    </div>
                  ))}
                </div>}
              </div>
            )}
            {validateGradingReady() && <p className="notice">전체 채점 전 확인: {validateGradingReady()}</p>}
            {failedGradingItems.length > 0 && (
              <div className="failure-box">
                <div className="actions space-between">
                  <strong>실패 항목 {failedGradingItems.length}건</strong>
                  <button type="button" className="secondary" onClick={retryFailedGradingItems} disabled={grading}>실패 항목 재시도</button>
                </div>
                <div className="list">
                  {failedGradingItems.map((item, index) => (
                    <div className="row question-row" key={`${item.submission_id}-${item.question_id}-${item.stage}-${index}`}>
                      <span>{item.student_label} / {item.question_label} / {item.stage === "ocr" ? "OCR" : "채점"} 실패</span>
                      <span className="muted">{item.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card stack submission-panel">
            <div className="submission-panel-heading">
              <h2>제출 학생</h2>
              <span className={`grading-status-text ${gradingStatusDone ? "done" : "pending"}`}>{gradingStatusDone ? "채점 완료" : "채점 미진행"}</span>
            </div>
            <div className="submission-filter-row">
              <button type="button" className={submissionFilter === "all" ? "active-toggle compact-button" : "secondary compact-button"} onClick={() => setSubmissionFilter("all")}>전체</button>
              <button type="button" className={submissionFilter === "ungraded" ? "active-toggle compact-button" : "secondary compact-button"} onClick={() => setSubmissionFilter("ungraded")}>미채점</button>
              <button type="button" className={submissionFilter === "review" ? "active-toggle compact-button" : "secondary compact-button"} onClick={() => setSubmissionFilter("review")}>검토</button>
              <button type="button" className={submissionFilter === "similar" ? "active-toggle compact-button" : "secondary compact-button"} onClick={() => setSubmissionFilter("similar")}>유사답안</button>
              <button type="button" className="secondary compact-button absence-manage-button" onClick={openAbsenceModal}>미응시{absentCount > 0 ? ` ${absentCount}명` : ""}</button>
            </div>
            <div className="compact-submission-list">
              {filteredSubmissionRows.length === 0 ? <p className="muted">표시할 학생이 없습니다.</p> : filteredSubmissionRows.map((row) => {
                const submission = row.submission;
                return (
                <div className="row compact-submission-row" key={row.key}>
                  <span>{row.studentNo} {row.studentName}</span>
                  <span className="status-dot-group" aria-label={row.statuses.join(", ")}>
                    {row.statuses.includes("ungraded") && <span className="status-dot ungraded" title="미채점" />}
                    {row.statuses.includes("review") && <span className="status-dot review" title="검토" />}
                    {row.statuses.includes("similar") && <span className="status-dot similar" title="유사답안" />}
                    {row.statuses.includes("absent") && <span className="status-dot absent" title="미응시" />}
                  </span>
                  {row.statuses.includes("absent") ? <span className="pill absent-pill">미응시</span> : submission ? <span className="pill page-pill">p.{submission.start_page}-{submission.end_page}</span> : <span className="pill danger-pill">답안 없음</span>}
                </div>
              );})}
            </div>
          </div>
        </div>}

        {activeTab === "results" && <div className="tab-panel results-split">
          <div className="card stack results-left-pane">
            <div className="section-heading-row">
              <h2>채점 결과</h2>
              <span className="pill">반 평균 : {selectedClassAverageScore === null ? "-" : `${Number.isInteger(selectedClassAverageScore) ? selectedClassAverageScore : selectedClassAverageScore.toFixed(1)}점`}</span>
              <label className="compact-select-label">반 선택<select value={selectedResultsExam?.id ?? ""} onChange={(event) => {
                setSelectedResultsExamId(Number(event.target.value));
                setSelectedResult(null);
              }}>
                {selectedExamGroup?.exams.map((exam) => <option key={exam.id} value={exam.id}>{classShortLabel(exam.class_name)}</option>)}
              </select></label>
            </div>
            <div className="actions result-toolbar">
              <button type="button" className="secondary compact-button" onClick={refresh}>새로고침</button>
              <button type="button" className={`${resultViewMode === "student" ? "active-toggle" : "secondary"} compact-button`} onClick={() => setResultViewMode("student")}>학생별</button>
              <button type="button" className={`${resultViewMode === "question" ? "active-toggle" : "secondary"} compact-button`} onClick={() => setResultViewMode("question")}>문항별</button>
              {selectedResultsExam && <a className="button-link secondary compact-button" href={`${API}/exams/${selectedResultsExam.id}/export/scores`}>Excel</a>}
            </div>
            {results.length === 0 ? <p className="muted">아직 채점 결과가 없습니다.</p> : (
              <div className="results-table">
                {resultViewMode === "student" && <>
                  <label className="result-select-label">학생 선택<select value={selectedResultSubmission?.submission_id ?? ""} onChange={(event) => selectStudentInResults(Number(event.target.value))}>
                    <option value="">학생 선택</option>
                    {results.map((submission) => <option key={submission.submission_id} value={submission.submission_id}>{submission.student_no} {submission.student_name}</option>)}
                  </select></label>
                  {selectedResultSubmission && <ResultStudentCard submission={selectedResultSubmission} onSelect={chooseResult} />}
                </>}
                {resultViewMode === "question" && <>
                  <label className="result-select-label">문항 선택<select value={selectedResultQuestion?.question_id ?? ""} onChange={(event) => selectQuestionInResults(Number(event.target.value))}>
                    <option value="">문항 선택</option>
                    {resultQuestionOptions.map((question) => <option key={question.question_id} value={question.question_id}>{question.question_no}번</option>)}
                  </select></label>
                  {selectedResultQuestion && <ResultQuestionCard question={selectedResultQuestion} results={results} onSelect={chooseResult} />}
                </>}
              </div>
            )}
          </div>

          <div className="card stack results-right-pane">
          {selectedResultQuestion && selectedResultSubmission ? (
            <>
              <div className="result-header">
                <strong>답안 위 표시: {selectedResultSubmission.student_no} {selectedResultSubmission.student_name} / {selectedResultQuestion.question_no}번</strong>
                <div className="actions">
                  {selectedResultQuestion.deductions.length > 0 && <span className="pill danger-pill">감점 표시</span>}
                  {selectedResultQuestion.similar_answer_review && <span className="pill similar-pill">유사답안</span>}
                  {selectedResultQuestion.review_reasons.filter((reason) => reason !== "ocr_review" && reason !== "ocr_low_confidence").map((reason) => <span className="pill missing" key={reason}>{reviewReasonLabel(reason)}</span>)}
                </div>
              </div>
              <div className="answer-review-layout">
                {!selectedResultPreviewUrl ? <p className="notice">이 문항의 답안 영역이 저장되어 있지 않습니다.</p> : (
                  <div className="answer-preview-column">
                  <div className={`result-preview-frame answer-crop-frame ${selectedResultQuestion.deductions.length > 0 ? "has-deduction" : ""} ${selectedResultQuestion.ocr_needs_review ? "has-ocr-risk" : ""} ${selectedResultQuestion.similar_answer_review ? "has-similar" : ""}`} onPointerEnter={updateAnswerMagnifier} onPointerMove={updateAnswerMagnifier} onPointerLeave={hideAnswerMagnifier} onPointerCancel={hideAnswerMagnifier}>
                    <img src={selectedResultPreviewUrl} alt="학생 문항 답안 미리보기" draggable={false} />
                    {answerMagnifier.visible && <div className="answer-magnifier" style={{
                      left: answerMagnifier.x,
                      top: answerMagnifier.y,
                      width: ANSWER_MAGNIFIER_SIZE,
                      height: ANSWER_MAGNIFIER_SIZE,
                      backgroundImage: `url(${selectedResultPreviewUrl})`,
                      backgroundPosition: `${answerMagnifier.backgroundX}px ${answerMagnifier.backgroundY}px`,
                      backgroundSize: `${answerMagnifier.backgroundWidth}px ${answerMagnifier.backgroundHeight}px`,
                    }} />}
                    <div className="crop-status-overlay">
                      {selectedResultFallbackAnnotations.filter((annotation) => annotation.annotation_type !== "ocr").map((annotation, index) => (
                        <span className={`pill ${annotation.annotation_type === "ocr" ? "warning-pill" : "danger-pill"}`} key={`fallback-${index}`}>{annotation.label || annotation.reason}</span>
                      ))}
                    </div>
                    {selectedResultBoxAnnotations.map((annotation, index) => (
                      <div className={`answer-highlight ${annotation.annotation_type} ${(annotation.y ?? 0) < 0.08 ? "label-below" : ""}`} key={`mark-${index}`} style={{
                        left: `${(annotation.x ?? 0) * 100}%`,
                        top: `${(annotation.y ?? 0) * 100}%`,
                        width: `${(annotation.width ?? 0) * 100}%`,
                        height: `${(annotation.height ?? 0) * 100}%`,
                      }} title={annotation.reason}>
                        <span>{annotation.label || annotation.evidence_text}</span>
                      </div>
                    ))}
                  </div>
                  <p className="magnifier-hint">이미지 위에 커서를 올리면 해당 부분이 확대됩니다.</p>
                  </div>
                )}
                <div className="overlay-detail">
                <strong>표시 사유</strong>
                <p>최종 점수: {selectedResultQuestion.final_score ?? "미채점"} / {selectedResultQuestion.max_score}</p>
                <p>AI 점수: {selectedResultQuestion.ai_score ?? "없음"} / 교사 점수: {selectedResultQuestion.teacher_override_score ?? "없음"}</p>
                <AwardedCriteriaSummary question={selectedResultQuestion} rubricText={selectedResultRubricText} />
                {selectedResultQuestion.similar_answer_review && <p className="notice">유사답안 사유: {selectedResultQuestion.similar_answer_reason || "사유 없음"}</p>}
                <p>OCR 신뢰도: {selectedResultQuestion.ocr_confidence ?? "없음"}</p>
                <p className="muted">OCR 텍스트: {previewText(selectedResultQuestion.ocr_text, "OCR 결과 없음")}</p>
                <TeacherOverrideForm question={selectedResultQuestion} onSave={saveTeacherOverride} />
                {selectedResultQuestion.similar_answer_review && <button type="button" className="secondary" onClick={async () => {
                  try {
                    await addSimilarAnswerToRubric(selectedResultQuestion);
                  } catch (err) {
                    setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }}>유사답안을 채점기준에 추가</button>}
                </div>
              </div>
            </>
          ) : <p className="notice">왼쪽 결과에서 답안 표시를 누르면 이곳에 바로 표시됩니다.</p>}
          </div>
        </div>}

        {similarRubricDraft && <div className="modal-backdrop">
          <div className="modal-card">
            <h2>유사답안 채점기준 추가</h2>
            <p className="muted">AI가 생성한 단계형 기준입니다. 저장 전에 바로 수정할 수 있습니다.</p>
            <label>제목<input value={similarRubricDraft.title} onChange={(event) => setSimilarRubricDraft({ ...similarRubricDraft, title: event.target.value })} /></label>
            <textarea value={similarRubricDraft.text} onChange={(event) => setSimilarRubricDraft({ ...similarRubricDraft, text: event.target.value })} />
            <div className="actions">
              <button type="button" onClick={async () => {
                try {
                  await saveSimilarRubricDraft();
                } catch (err) {
                  setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                }
              }}>저장</button>
              <button type="button" className="secondary" onClick={() => setSimilarRubricDraft(null)}>취소</button>
            </div>
          </div>
        </div>}

        {absenceModalOpen && <div className="modal-backdrop">
          <div className="modal-card absence-modal-card">
            <div className="section-heading-row">
              <h2>미응시 학생</h2>
              <span className="pill absent-pill">선택 {absenceDraftStudentIds.length}명</span>
            </div>
            <p className="muted">답안 PDF에 아예 없는 학생만 선택하세요. 저장 후 PDF 업로드 시 선택한 학생은 배정에서 제외됩니다.</p>
            <div className="absence-student-grid">
              {students.map((student) => {
                const selected = absenceDraftStudentIds.includes(student.id);
                return (
                  <button type="button" className={selected ? "absence-student active" : "absence-student"} key={student.id} onClick={() => toggleAbsenceDraft(student.id)}>
                    <span>{student.student_no} {student.name}</span>
                    {selected && <span className="pill absent-pill">미응시</span>}
                  </button>
                );
              })}
            </div>
            <div className="actions">
              <button type="button" onClick={async () => {
                try {
                  await saveAbsenceDraft();
                } catch (err) {
                  setStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
                }
              }}>저장</button>
              <button type="button" className="secondary" onClick={() => setAbsenceModalOpen(false)}>취소</button>
            </div>
          </div>
        </div>}
      </section>
    </main>
  );
}

function makeRect(startX: number, startY: number, currentX: number, currentY: number): SelectionRect {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  return {
    x,
    y,
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY)
  };
}

type ExamGroup = {
  key: string;
  name: string;
  subject: string;
  pages_per_student: number;
  formula_recognition_enabled: boolean;
  exams: Exam[];
};

type SubmissionRowStatus = Exclude<SubmissionFilter, "all"> | "absent";

type SubmissionRow = {
  key: string;
  studentNo: string;
  studentName: string;
  submission: Submission | null;
  statuses: SubmissionRowStatus[];
};

function groupExamsByName(exams: Exam[]): ExamGroup[] {
  const groups = new Map<string, Exam[]>();
  for (const exam of exams) {
    const key = [exam.name || "이름 없는 시험", exam.subject || "과목 없음", exam.pages_per_student, exam.formula_recognition_enabled ? "formula-on" : "formula-off"].join("::");
    groups.set(key, [...(groups.get(key) ?? []), exam]);
  }
  return Array.from(groups.values()).map((groupExams) => {
    const sortedExams = [...groupExams].sort((a, b) => classSortValue(a.class_name) - classSortValue(b.class_name) || a.id - b.id);
    const representative = sortedExams[0];
    return {
      key: [representative?.name || "이름 없는 시험", representative?.subject || "과목 없음", representative?.pages_per_student ?? 0, representative?.formula_recognition_enabled ? "formula-on" : "formula-off"].join("::"),
      name: representative?.name || "이름 없는 시험",
      subject: representative?.subject || "과목 없음",
      pages_per_student: representative?.pages_per_student ?? 0,
      formula_recognition_enabled: representative?.formula_recognition_enabled ?? true,
      exams: sortedExams,
    };
  });
}

function formatExamGroupLabel(group: ExamGroup): string {
  if (group.exams.length === 0) return group.name;
  const classNumbers = group.exams.map((exam) => extractClassNumber(exam.class_name)).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const gradeNumbers = group.exams.map((exam) => extractGradeNumber(exam.class_name)).filter((value): value is number => value !== null);
  const gradeLabel = gradeNumbers.length > 0 ? `${gradeNumbers[0]}학년` : "학년 없음";
  const classLabel = classNumbers.length === 0 ? group.exams.map((exam) => exam.class_name || "반 없음").join(", ") : `${classNumbers[0]}반~${classNumbers[classNumbers.length - 1]}반`;
  const formulaLabel = group.formula_recognition_enabled ? "수식ON" : "수식OFF";
  return `${group.name}/${group.subject}/${gradeLabel}/${classLabel}/${group.pages_per_student}쪽/${formulaLabel}`;
}

function classShortLabel(className: string): string {
  const classNo = extractClassNumber(className);
  return classNo === null ? className || "반 이름 없음" : `${classNo}반`;
}

function classSortValue(className: string): number {
  return extractClassNumber(className) ?? Number.MAX_SAFE_INTEGER;
}

function extractClassNumber(className: string): number | null {
  const match = String(className || "").match(/(\d+)\s*반/);
  return match ? Number(match[1]) : null;
}

function extractGradeNumber(className: string): number | null {
  const match = String(className || "").match(/(\d+)\s*학년/);
  return match ? Number(match[1]) : null;
}

function makeSubmissionRows(students: Student[], submissions: Submission[], results: SubmissionResults[], questionCount: number): SubmissionRow[] {
  const studentRows = students.map((student) => {
    const submission = submissions.find((item) => item.student_id === student.id || item.student_no === student.student_no) ?? null;
    return makeSubmissionRow(`student-${student.id}`, student.student_no, student.name, submission, results, questionCount, student.is_absent);
  });
  const extraSubmissionRows = submissions
    .filter((submission) => !students.some((student) => student.id === submission.student_id || student.student_no === submission.student_no))
    .map((submission) => makeSubmissionRow(`submission-${submission.id}`, submission.student_no, submission.student_name, submission, results, questionCount, false));
  return [...studentRows, ...extraSubmissionRows];
}

function makeSubmissionRow(key: string, studentNo: string, studentName: string, submission: Submission | null, results: SubmissionResults[], questionCount: number, isAbsent: boolean): SubmissionRow {
  const result = submission ? results.find((item) => item.submission_id === submission.id || (item.student_no === studentNo && item.student_name === studentName)) : null;
  const statuses: SubmissionRowStatus[] = [];
  if (isAbsent) {
    statuses.push("absent");
    return { key, studentNo, studentName, submission, statuses };
  }
  if (submission && (!result || result.questions.length < questionCount || result.questions.some((question) => question.final_score === null))) {
    statuses.push("ungraded");
  }
  if (result && (result.needs_teacher_review_count > 0 || result.questions.some((question) => question.needs_teacher_review || question.ocr_needs_review))) {
    statuses.push("review");
  }
  if (result?.questions.some((question) => question.similar_answer_review)) {
    statuses.push("similar");
  }
  return { key, studentNo, studentName, submission, statuses };
}

function isFullGradingComplete(students: Student[], submissions: Submission[], results: SubmissionResults[], questionCount: number): boolean {
  const presentCount = students.filter((student) => !student.is_absent).length;
  if (presentCount === 0) return false;
  if (submissions.length < presentCount) return false;
  if (submissions.length === 0 || questionCount === 0) return false;
  return submissions.every((submission) => {
    const result = results.find((item) => item.submission_id === submission.id);
    return Boolean(result && result.questions.length >= questionCount && result.questions.every((question) => question.final_score !== null));
  });
}

function parseRubricSteps(text: string): { name: string; points: number | null; criterion: string }[] {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.match(/^\d+\.\s*([^(:：]+)\s*(?:\((\d+(?:\.\d+)?)점\))?\s*[:：]\s*(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      name: match[1].trim(),
      points: match[2] ? Number(match[2]) : null,
      criterion: match[3].trim()
    }));
}

function reviewReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    ocr_review: "OCR 확인",
    ocr_low_confidence: "OCR 신뢰도 낮음",
    score_deviation: "재검 편차",
    grading_uncertain: "채점 불확실"
  };
  return labels[reason] ?? reason;
}

function hasTeacherReviewReason(question: GradingQuestionResult): boolean {
  return question.review_reasons.some((reason) => reason === "score_deviation" || reason === "ocr_review" || reason === "ocr_low_confidence");
}

function visibleAnswerAnnotations(question: GradingQuestionResult): AnswerAnnotation[] {
  const shouldShowOcr = question.ocr_needs_review || question.review_reasons.some((reason) => reason === "ocr_review" || reason === "ocr_low_confidence");
  return question.annotations.filter((annotation) => {
    if (annotation.annotation_type === "ocr") return shouldShowOcr;
    return true;
  });
}

function hasAnnotationBox(annotation: AnswerAnnotation): boolean {
  return annotation.x !== null && annotation.y !== null && annotation.width !== null && annotation.height !== null && annotation.width > 0 && annotation.height > 0 && annotation.confidence >= 0.35;
}

function DeductionList({ deductions, fallback }: { deductions: Deduction[]; fallback: string }) {
  if (deductions.length === 0) return null;
  return (
    <div className="deduction-list">
      {deductions.map((deduction, index) => (
        <span className="deduction-chip" key={`${deduction.step_name}-${index}`}>
          <strong>{deduction.step_name}</strong> (-{deduction.points_lost}점): {deduction.short_reason || summarizeDeductionReason(deduction.reason)}{deduction.ocr_related ? " / OCR" : ""}
        </span>
      ))}
    </div>
  );
}

function AwardedCriteriaSummary({ question, rubricText }: { question: GradingQuestionResult; rubricText: string }) {
  const steps = parseRubricSteps(rubricText);
  const deductionsByStep = new Map(question.deductions.map((deduction) => [deduction.step_name, deduction]));
  const scoredSteps = steps.map((step) => {
    const deduction = deductionsByStep.get(step.name);
    const points = step.points === null ? null : Math.max(0, step.points - (deduction?.points_lost ?? 0));
    return { ...step, points, deduction };
  });
  const awarded = scoredSteps.filter((step) => typeof step.points !== "number" || step.points > 0);
  const deducted = question.deductions;
  if (awarded.length === 0 && deducted.length === 0) {
    return <p className="muted">채점기준별 부여 점수: {previewText(question.final_reason || question.deduction_reasons, "세부 기준 정보 없음")}</p>;
  }
  return (
    <div className="awarded-criteria-box">
      <strong>채점기준별 부여 점수</strong>
      {awarded.length > 0 ? <div className="deduction-list compact-deductions">
        {awarded.map((step) => <span className="deduction-chip awarded-chip" key={step.name} title={step.criterion}>{step.name}: {step.points ?? "판정"}{typeof step.points === "number" ? "점" : ""}</span>)}
      </div> : <p className="muted">부여된 채점기준 없음</p>}
      {deducted.length > 0 && <>
        <strong>감점 기준</strong>
        <DeductionList deductions={deducted} fallback={question.deduction_reasons} />
      </>}
    </div>
  );
}

function SimilarAnswerList({ answers }: { answers: SimilarAnswer[] }) {
  return (
    <div className="similar-answer-section">
      <strong>문항별 유사답안</strong>
      {answers.length === 0 ? <p className="muted">저장된 유사답안이 없습니다.</p> : (
        <div className="list similar-answer-list">
          {answers.map((answer) => (
            <div className="row question-row similar-answer-item" key={answer.id}>
              <strong>{answer.title || "유사답안"}</strong>
              <p className="muted">{previewText(answer.text, "내용 없음")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SimilarAnswerEditor({
  question,
  onCreate,
  onUpdate,
  onDelete,
}: {
  question: Question;
  onCreate: (event: FormEvent<HTMLFormElement>, questionId: number) => Promise<void>;
  onUpdate: (event: FormEvent<HTMLFormElement>, question: Question, answer: SimilarAnswer) => Promise<void>;
  onDelete: (question: Question, answer: SimilarAnswer) => Promise<void>;
}) {
  return (
    <div className="similar-answer-section">
      <strong>유사답안</strong>
      {(question.similar_answers ?? []).map((answer) => (
        <form className="similar-answer-edit-card" key={answer.id} onSubmit={(event) => onUpdate(event, question, answer)}>
          <label>제목<input name="title" defaultValue={answer.title} placeholder="예: 다른 풀이, 대체 반례" /></label>
          <label>내용/채점 기준<textarea name="text" defaultValue={answer.text} /></label>
          <label>출처 메모<input name="source_reason" defaultValue={answer.source_reason} placeholder="결과 화면에서 추가된 사유 등" /></label>
          <div className="actions">
            <button type="submit" className="secondary">유사답안 저장</button>
            <button type="button" className="mini-danger" onClick={() => onDelete(question, answer)}>삭제</button>
          </div>
        </form>
      ))}
      <form className="similar-answer-edit-card new-similar-answer" onSubmit={(event) => onCreate(event, question.id)}>
        <strong>새 유사답안 추가</strong>
        <label>제목<input name="title" placeholder="예: 다른 풀이, 대체 반례" /></label>
        <label>내용/채점 기준<textarea name="text" placeholder="인정할 풀이와 점수 기준을 적어주세요." required /></label>
        <label>출처 메모<input name="source_reason" placeholder="선택 사항" /></label>
        <button type="submit" className="secondary">유사답안 추가</button>
      </form>
    </div>
  );
}

function CompactDeductionList({ deductions }: { deductions: Deduction[] }) {
  if (deductions.length === 0) return null;
  return <div className="deduction-list compact-deductions">{deductions.map((deduction, index) => <span className="deduction-chip" key={`${deduction.step_name}-${index}`}>{deduction.step_name} -{deduction.points_lost}</span>)}</div>;
}

function summarizeDeductionReason(reason: string): string {
  const text = String(reason || "").trim();
  if (!text) return "감점 사유 확인 필요";
  const quoted = text.match(/["“']([^"”']{1,50})["”']/)?.[1];
  const mathValue = text.match(/([a-zA-Z가-힣]?\s*=?\s*-?\d+(?:\.\d+)?)/)?.[1]?.replace(/\s+/g, "");
  if (/누락|빠뜨|포함/.test(text)) {
    const target = quoted || mathValue;
    return target ? `${target} 누락` : "필수 답 또는 조건 누락";
  }
  if (/부호/.test(text)) return "부호 조건 제시 못함";
  if (/조건/.test(text)) return "필요 조건 제시 부족";
  if (/계산/.test(text)) return "계산 과정 또는 값 오류";
  if (/근거|이유|설명/.test(text)) return "근거 설명 부족";
  if (/범위/.test(text)) return "범위 판단 오류";
  const firstSentence = text.split(/[.!?。]/)[0]?.trim() || text;
  return firstSentence.length > 34 ? `${firstSentence.slice(0, 34)}...` : firstSentence;
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function TeacherOverrideForm({ question, onSave }: { question: GradingQuestionResult; onSave: (question: GradingQuestionResult, score: number, note: string) => Promise<void> }) {
  const [score, setScore] = useState(String(question.teacher_override_score ?? question.final_score ?? ""));
  const [note, setNote] = useState(question.teacher_note || "");
  useEffect(() => {
    setScore(String(question.teacher_override_score ?? question.final_score ?? ""));
    setNote(question.teacher_note || "");
  }, [question.question_id, question.final_score, question.teacher_override_score, question.teacher_note]);

  return (
    <div className="teacher-override-box">
      <strong>교사 점수 수정</strong>
      <div className="actions">
        <label>점수<input type="number" min="0" max={question.max_score} step="0.5" value={score} onChange={(event) => setScore(event.target.value)} /></label>
        <label>메모<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="수정 사유 또는 확인 메모" /></label>
        <button type="button" onClick={() => onSave(question, Number(score), note)}>교사 점수 저장</button>
      </div>
      {question.teacher_reviewed && <span className="pill saved">교사 확인 완료</span>}
    </div>
  );
}

function ResultStudentCard({ submission, onSelect }: { submission: SubmissionResults; onSelect: (submissionId: number, questionId: number) => void }) {
  return (
    <div className="result-card">
      <div className="result-header">
        <strong>{submission.student_no} {submission.student_name}</strong>
        <span>총점 {submission.total_score}</span>
        {submission.needs_teacher_review_count > 0 && <span className="pill missing">검토 {submission.needs_teacher_review_count}건</span>}
      </div>
      <div className="list">
        {submission.questions.map((question) => (
          <ResultQuestionRow key={question.question_id} question={question} onSelect={() => onSelect(submission.submission_id, question.question_id)} />
        ))}
      </div>
    </div>
  );
}

function ResultQuestionCard({ question, results, onSelect }: { question: GradingQuestionResult; results: SubmissionResults[]; onSelect: (submissionId: number, questionId: number) => void }) {
  const rows = results.map((submission) => ({ submission, result: submission.questions.find((item) => item.question_id === question.question_id) })).filter((item) => item.result);
  const gradedScores = rows.map((item) => item.result?.final_score).filter((score): score is number => typeof score === "number");
  const averageScore = gradedScores.length > 0 ? gradedScores.reduce((sum, score) => sum + score, 0) / gradedScores.length : null;
  return (
    <div className="result-card">
      <div className="result-header">
        <strong>{question.question_no}번 / {question.max_score}점</strong>
        <span>평균 {averageScore === null ? "-" : `${formatScore(averageScore)}점`}</span>
        <span>{rows.filter((item) => item.result?.needs_teacher_review || item.result?.ocr_needs_review).length}명 검토</span>
      </div>
      <div className="list">
        {rows.map(({ submission, result }) => result && (
          <div className="row question-row" key={`${submission.submission_id}-${question.question_id}`}>
            <div className="actions space-between full-width">
              <span>{submission.student_no} {submission.student_name}: {result.final_score ?? "미채점"} / {result.max_score}</span>
              <button type="button" className="secondary compact-button" onClick={() => onSelect(submission.submission_id, result.question_id)}>답안</button>
            </div>
            {result.similar_answer_review && <span className="pill similar-pill">유사답안 검토</span>}
            <CompactDeductionList deductions={result.deductions} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultQuestionRow({ question, onSelect }: { question: GradingQuestionResult; onSelect: () => void }) {
  const compactBadges = [
    hasTeacherReviewReason(question) ? "검토" : null,
    question.similar_answer_review ? "유사답안" : null,
    question.ocr_needs_review || question.review_reasons.includes("ocr_review") ? "OCR확인" : null,
    question.review_reasons.includes("ocr_low_confidence") ? "OCR 신뢰도 낮음" : null,
  ].filter((item): item is string => Boolean(item));
  return (
    <div className="row question-row">
      <div className="actions space-between full-width result-question-main-row">
        <span>{question.question_no}번: {question.final_score ?? "미채점"} / {question.max_score}</span>
        <div className="result-inline-badges">
          {compactBadges.map((label) => <span className={`pill tiny-pill ${label === "유사답안" ? "similar-pill" : label.startsWith("OCR") ? "warning-pill" : "missing"}`} key={label}>{label}</span>)}
        </div>
        <button type="button" className="secondary compact-button" onClick={onSelect}>답안</button>
      </div>
      <CompactDeductionList deductions={question.deductions} />
    </div>
  );
}

async function readApiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatApiError(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    return JSON.stringify(detail, null, 2);
  }
  return JSON.stringify(payload, null, 2);
}

class ApiError extends Error {
  payload: unknown;

  constructor(payload: unknown) {
    super(formatApiError(payload));
    this.name = "ApiError";
    this.payload = payload;
  }
}

function isPdfPageCountMismatch(payload: unknown): payload is PdfPageCountMismatchDetail {
  return Boolean(payload && typeof payload === "object" && (payload as { code?: unknown }).code === "pdf_page_count_mismatch");
}

function getPdfPageCountMismatch(payload: unknown): PdfPageCountMismatchDetail | null {
  const detail = payload && typeof payload === "object" && "detail" in payload ? (payload as { detail: unknown }).detail : payload;
  return isPdfPageCountMismatch(detail) ? detail : null;
}

function previewText(value: string, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 90 ? `${trimmed.slice(0, 90)}...` : trimmed;
}
