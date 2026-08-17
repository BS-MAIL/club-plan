const express = require("express");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "classes.json");

const uid = () => Math.random().toString(36).slice(2, 10);
const clean = (value, max = 40) => String(value || "").trim().slice(0, max);
const round2 = (value) => Math.round(value * 100) / 100;
const rankPoints = { 1: 3, 2: 2, 3: 1 };
const ROUND_SECONDS = 90;
const brandAliases = [
  ["BHC", ["bhc", "b.h.c", "비에이치씨"]],
  ["교촌", ["교촌", "kyochon"]],
  ["BBQ", ["bbq", "비비큐"]],
  ["굽네", ["굽네", "goobne"]],
  ["처갓집", ["처갓집"]],
  ["네네", ["네네", "nene"]],
  ["푸라닭", ["푸라닭", "puradak"]],
  ["노랑통닭", ["노랑통닭"]],
  ["맥도날드", ["맥도날드", "맥날", "mcdonald", "mcdonalds"]],
  ["버거킹", ["버거킹", "burgerking"]],
  ["롯데리아", ["롯데리아", "lotteria"]],
  ["맘스터치", ["맘스터치", "momstouch"]],
];

let store = loadStore();
if (!Array.isArray(store.topicSets)) store.topicSets = [];
const roundTimers = new Map();

function loadStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) return { classes: [], topicSets: [] };
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { classes: Array.isArray(parsed.classes) ? parsed.classes : [], topicSets: Array.isArray(parsed.topicSets) ? parsed.topicSets : [] };
  } catch (error) {
    console.error("자료 파일을 읽지 못했습니다.", error);
    return { classes: [], topicSets: [] };
  }
}

function saveStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

function makeClass(name) {
  return { id: uid(), name, teams: [], students: [], topics: [], selectedTopicId: null, answerVisible: false, roundEndsAt: null, roundPaused: false, roundRemainingMs: null, scores: {}, roundHistory: [], usedTopicIds: [], createdAt: Date.now() };
}

function makeTopic({ name, unit, allowText }) {
  return { id: uid(), name: clean(name), unit: clean(unit, 12), allowText: Boolean(allowText), entries: [], predictions: [], representativeType: null, createdAt: Date.now() };
}

function getClass(classId) {
  return store.classes.find((klass) => klass.id === classId) || null;
}

function classroomUrls() {
  if (process.env.PUBLIC_URL) return [`${process.env.PUBLIC_URL.replace(/\/$/, "")}/student`];
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return [`https://${process.env.RAILWAY_PUBLIC_DOMAIN}/student`];
  return Object.values(os.networkInterfaces()).flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${PORT}/student`);
}

function ensureClassShape(klass) {
  if (!Array.isArray(klass.teams)) klass.teams = [];
  if (!Array.isArray(klass.students)) klass.students = [];
  if (!Array.isArray(klass.topics)) klass.topics = [];
  if (!klass.scores) klass.scores = {};
  if (!Array.isArray(klass.roundHistory)) klass.roundHistory = [];
  if (!Array.isArray(klass.usedTopicIds)) klass.usedTopicIds = [];
  if (typeof klass.gameStarted !== "boolean") klass.gameStarted = false;
  if (!Number.isFinite(klass.roundId)) klass.roundId = 0;
  if (typeof klass.roundPaused !== "boolean") klass.roundPaused = false;
  if (klass.roundRemainingMs !== null && !Number.isFinite(klass.roundRemainingMs)) klass.roundRemainingMs = null;
  if (klass.roundEndsAt !== null && !Number.isFinite(klass.roundEndsAt)) klass.roundEndsAt = null;
  return klass;
}

for (const klass of store.classes) {
  ensureClassShape(klass);
  if (klass.roundEndsAt && !klass.answerVisible) scheduleRoundReveal(klass);
}

function studentKey(studentNumber, studentName) {
  return `${clean(studentNumber, 8)}-${clean(studentName, 24)}`;
}

function teamMemberCount(klass, team) {
  const count = ensureClassShape(klass).students.filter((student) => student.team === team).length;
  return Math.max(1, count);
}

function requiredApprovals(klass, team) {
  return Math.floor(teamMemberCount(klass, team) / 2) + 1;
}

function updateStudentReferences(klass, previous, next) {
  if (!previous?.key || previous.key === next.key) return;
  const [previousNumber, ...previousNameParts] = previous.key.split("-");
  const previousName = previousNameParts.join("-");
  for (const topic of klass.topics) {
    for (const entry of topic.entries || []) {
      if (entry.team === previous.team && entry.studentNumber === previousNumber && entry.studentName === previousName) {
        entry.team = next.team;
        entry.studentNumber = next.studentNumber;
        entry.studentName = next.studentName;
      }
    }
    for (const prediction of topic.predictions || []) {
      if (prediction.proposedBy === previous.key) prediction.proposedBy = next.key;
      prediction.approvals = (prediction.approvals || []).map((approval) => approval === previous.key ? next.key : approval);
      if (prediction.changeProposal) {
        if (prediction.changeProposal.proposedBy === previous.key) prediction.changeProposal.proposedBy = next.key;
        prediction.changeProposal.approvals = (prediction.changeProposal.approvals || []).map((approval) => approval === previous.key ? next.key : approval);
      }
    }
  }
}

function isMajority(klass, team, approvals) {
  return new Set(approvals || []).size >= requiredApprovals(klass, team);
}

function sortedValues(topic) {
  return topic.entries.map((entry) => entry.value).filter(Number.isFinite).sort((a, b) => a - b);
}

function textValues(topic) {
  return topic.entries.map((entry) => normalizeTextValue(entry.value)).filter(Boolean);
}

function normalizeTextValue(value) {
  const original = clean(value, 80);
  if (!original) return "";
  const compact = original.toLocaleLowerCase("ko-KR").replace(/[\s._\-·]+/g, "").replace(/[!?,~]/g, "");
  for (const [label, aliases] of brandAliases) {
    if (aliases.some((alias) => compact.includes(alias.toLocaleLowerCase("ko-KR").replace(/[\s._\-·]+/g, "")))) return label;
  }
  return compact;
}

function textStats(topic) {
  const groups = new Map();
  for (const entry of topic.entries) {
    const key = normalizeTextValue(entry.value);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, count: 0, labels: new Map() });
    const group = groups.get(key);
    const label = clean(entry.value, 80);
    group.count += 1;
    group.labels.set(label, (group.labels.get(label) || 0) + 1);
  }
  const list = [...groups.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "ko"));
  const max = list[0]?.count || 0;
  const modes = list.filter((group) => group.count === max).map((group) => {
    const label = [...group.labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))[0]?.[0] || group.key;
    return { ...group, label };
  });
  return { count: list.reduce((sum, group) => sum + group.count, 0), list, modes };
}

function modeOf(values) {
  if (!values.length) return { values: [], count: 0, useful: false };
  const counts = new Map();
  for (const value of values) counts.set(String(value), (counts.get(String(value)) || 0) + 1);
  const max = Math.max(...counts.values());
  const modes = [...counts.entries()].filter(([, count]) => count === max).map(([value]) => value);
  const sortedModes = modes.every((value) => Number.isFinite(Number(value)))
    ? modes.map(Number).sort((a, b) => a - b)
    : modes.sort((a, b) => a.localeCompare(b, "ko"));
  return { values: sortedModes, count: max, useful: max > 1 && modes.length < values.length };
}

function stats(topic) {
  if (topic.allowText) {
    const text = textStats(topic);
    if (!text.count) return null;
    return {
      count: text.count,
      mean: null,
      median: null,
      mode: text.modes.map((item) => item.label),
      modeCount: text.modes[0]?.count || 0,
      modeKeys: text.modes.map((item) => item.key),
      min: null,
      max: null,
      range: null,
      recommendedType: "mode",
      reason: "글자 자료는 띄어쓰기, 대소문자, 일부 브랜드 표현 차이를 묶어 최빈값으로 대표를 정합니다.",
      selectedType: "mode",
      representativeValue: text.modes[0]?.label,
      representativeKey: text.modes[0]?.key,
    };
  }
  const values = sortedValues(topic);
  if (!values.length) return null;
  const mean = round2(values.reduce((acc, value) => acc + value, 0) / values.length);
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid] : round2((values[mid - 1] + values[mid]) / 2);
  const mode = modeOf(values);
  const min = values[0];
  const max = values[values.length - 1];
  const range = round2(max - min);
  const outlierCut = values.length >= 5 ? Math.max(5, Math.abs(mean) * 0.25) : Infinity;
  const hasOutlier = values.some((value) => Math.abs(value - median) > outlierCut);
  let recommendedType = "mean";
  let reason = "자료가 비교적 고르게 모여 평균을 대푯값으로 쓰기 좋습니다.";
  if (mode.useful && mode.count >= Math.ceil(values.length / 3)) {
    recommendedType = "mode";
    reason = "같은 값이 뚜렷하게 많이 나와 최빈값이 자료의 특징을 잘 보여줍니다.";
  } else if (hasOutlier || range > Math.max(10, Math.abs(mean) * 0.6)) {
    recommendedType = "median";
    reason = "극단적인 값이나 큰 범위가 있어 중앙값이 자료의 중심을 안정적으로 보여줍니다.";
  }
  const selectedType = topic.representativeType || recommendedType;
  const representativeValue = selectedType === "mode" ? mode.values[0] : selectedType === "median" ? median : mean;
  return { count: values.length, mean, median, mode: mode.values, modeCount: mode.count, min, max, range, recommendedType, reason, selectedType, representativeValue };
}

function publicClass(klass) {
  ensureClassShape(klass);
  return { ...klass, topics: klass.topics.map((topic) => ({ ...topic, stats: stats(topic) })), roundHistory: klass.roundHistory.slice(-10) };
}

function publicState(classId = null) {
  if (!Array.isArray(store.topicSets)) store.topicSets = [];
  const selectedClass = classId ? getClass(classId) : null;
  return {
    classes: store.classes.map((klass) => {
      ensureClassShape(klass);
      return {
      id: klass.id,
      name: klass.name,
      teams: klass.teams,
      topicCount: klass.topics.length,
      studentCount: new Set(klass.topics.flatMap((topic) => topic.entries.map((entry) => `${entry.studentNumber}-${entry.studentName}`))).size,
    }}),
    studentUrls: classroomUrls(),
    topicSets: store.topicSets,
    classId,
    classRoom: selectedClass ? publicClass(selectedClass) : null,
  };
}

function resultPayload(klass, topic, result, topicStats) {
  const rankedResults = rankedClosestResults(topic);
  return {
    roundId: klass.roundId,
    result,
    rankings: result ? rankedResults.filter((item) => item.points > 0).map((item) => ({ ...item, topicName: topic.name, unit: topic.unit, representativeType: topicStats.selectedType, representativeValue: topicStats.representativeValue, reason: topicStats.reason })) : [],
    topicName: topic.name,
    stats: topicStats,
    unit: topic.unit,
    roundEndsAt: klass.roundEndsAt,
  };
}

function emitAll() {
  io.emit("state", publicState());
  for (const klass of store.classes) io.to(klass.id).emit("class:state", publicState(klass.id));
}

function selectedTopic(klass) {
  return klass.topics.find((topic) => topic.id === klass.selectedTopicId) || null;
}

function modeRankMap(topic) {
  const groups = new Map();
  for (const entry of topic.entries) {
    const key = topic.allowText ? normalizeTextValue(entry.value) : String(entry.value);
    if (!key) continue;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
  let previousCount = null;
  let rank = 0;
  return new Map(sorted.map(([key, count]) => {
    if (count !== previousCount) rank += 1;
    previousCount = count;
    return [key, { rank, count }];
  }));
}

function closestResults(topic) {
  const topicStats = stats(topic);
  if (!topicStats) return [];
  const ranks = topicStats.selectedType === "mode" ? modeRankMap(topic) : null;
  return topic.predictions.filter((prediction) => prediction.confirmed).map((prediction) => {
    const entry = topic.entries.find((item) => item.id === prediction.entryId);
    const entryModeKey = entry && topicStats.selectedType === "mode" ? (topic.allowText ? normalizeTextValue(entry.value) : String(entry.value)) : null;
    const modeRank = entryModeKey ? ranks.get(entryModeKey)?.rank : null;
    const diff = entry
      ? topicStats.selectedType === "mode"
        ? (modeRank || Infinity) - 1
        : topic.allowText
        ? normalizeTextValue(entry.value) === topicStats.representativeKey ? 0 : 1
        : Math.abs(entry.value - topicStats.representativeValue)
      : Infinity;
    return { ...prediction, studentName: entry?.studentName || "삭제된 학생", studentNumber: entry?.studentNumber || "", value: entry?.value ?? null, diff: round2(diff), modeRank };
  }).sort((a, b) => a.diff - b.diff || a.team.localeCompare(b.team, "ko"));
}

function rankedClosestResults(topic) {
  const results = closestResults(topic).filter((item) => Number.isFinite(item.diff));
  let previousDiff = null;
  let currentRank = 0;
  return results.map((result, index) => {
    if (Number.isFinite(result.modeRank)) return { ...result, rank: result.modeRank, points: rankPoints[result.modeRank] || 0 };
    if (previousDiff === null || result.diff !== previousDiff) currentRank = index + 1;
    previousDiff = result.diff;
    return { ...result, rank: currentRank, points: rankPoints[currentRank] || 0 };
  });
}

function revealAnswerForClass(klass) {
  const topic = selectedTopic(klass);
  if (!klass || !topic) return null;
  const alreadyVisible = klass.answerVisible;
  klass.answerVisible = true;
  klass.roundEndsAt = null;
  klass.roundPaused = false;
  klass.roundRemainingMs = null;
  if (roundTimers.has(klass.id)) {
    clearTimeout(roundTimers.get(klass.id));
    roundTimers.delete(klass.id);
  }
  const results = rankedClosestResults(topic);
  const topicStats = stats(topic);
  let result = null;
  const scoredResults = results.filter((item) => item.points > 0);
  if (scoredResults.length) {
    if (!alreadyVisible) {
      for (const item of scoredResults) klass.scores[item.team] = (klass.scores[item.team] || 0) + item.points;
      klass.roundHistory.push({ at: Date.now(), topicName: topic.name, winners: scoredResults.map(({ team, studentName, studentNumber, diff, rank, points }) => ({ team, studentName, studentNumber, diff, rank, points })) });
    }
    result = { ...scoredResults[0], topicName: topic.name, unit: topic.unit, representativeType: topicStats.selectedType, representativeValue: topicStats.representativeValue, reason: topicStats.reason };
  }
  saveStore();
  emitAll();
  const payload = resultPayload(klass, topic, result, topicStats);
  io.to(klass.id).emit("class:answer", payload);
  return payload;
}

function scheduleRoundReveal(klass) {
  if (!klass?.roundEndsAt || klass.answerVisible) return;
  if (roundTimers.has(klass.id)) clearTimeout(roundTimers.get(klass.id));
  const delay = Math.max(0, klass.roundEndsAt - Date.now());
  roundTimers.set(klass.id, setTimeout(() => revealAnswerForClass(klass), delay + 3200));
}

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.redirect("/teacher"));
app.get("/teacher", (_req, res) => res.sendFile(path.join(__dirname, "public", "teacher.html")));
app.get("/student", (_req, res) => res.sendFile(path.join(__dirname, "public", "student.html")));

io.on("connection", (socket) => {
  socket.emit("state", publicState());

  socket.on("class:join", ({ classId }, ack) => {
    const klass = getClass(classId);
    if (!klass) return ack?.({ ok: false, message: "반을 찾을 수 없습니다." });
    socket.join(klass.id);
    ack?.({ ok: true, state: publicState(klass.id) });
    socket.emit("class:state", publicState(klass.id));
  });

  socket.on("teacher:create-class", ({ name }, ack) => {
    const className = clean(name, 50);
    if (!className) return ack?.({ ok: false, message: "반 이름을 입력하세요." });
    const klass = makeClass(className);
    store.classes.push(klass);
    saveStore();
    emitAll();
    ack?.({ ok: true, classId: klass.id });
  });

  socket.on("teacher:delete-class", ({ classId }, ack) => {
    const klass = getClass(classId);
    if (!klass) return ack?.({ ok: false, message: "반을 찾을 수 없습니다." });
    store.classes = store.classes.filter((item) => item.id !== classId);
    saveStore();
    io.to(classId).emit("class:deleted", { classId });
    emitAll();
    ack?.({ ok: true });
  });

  socket.on("teacher:add-topic", ({ classId, name, unit, allowText }, ack) => {
    const klass = getClass(classId);
    const topicName = clean(name);
    if (!klass || !topicName) return ack?.({ ok: false, message: "반과 주제 이름을 확인하세요." });
    klass.topics.push(makeTopic({ name: topicName, unit, allowText }));
    saveStore();
    emitAll();
    ack?.({ ok: true });
  });

  socket.on("teacher:save-topic-set", ({ classId, name }, ack) => {
    const klass = getClass(classId);
    const setName = clean(name, 50);
    if (!klass || !setName) return ack?.({ ok: false, message: "반과 목록 이름을 확인하세요." });
    ensureClassShape(klass);
    const topics = klass.topics.map((topic) => ({ name: topic.name, unit: topic.unit, allowText: Boolean(topic.allowText) }));
    if (!topics.length) return ack?.({ ok: false, message: "저장할 주제가 없습니다." });
    const saved = { id: uid(), name: setName, topics, createdAt: Date.now() };
    store.topicSets = [saved, ...store.topicSets.filter((item) => item.name !== setName)];
    saveStore();
    emitAll();
    ack?.({ ok: true, topicSet: saved });
  });

  socket.on("teacher:apply-topic-set", ({ classId, setId }, ack) => {
    const klass = getClass(classId);
    const topicSet = store.topicSets.find((item) => item.id === setId);
    if (!klass || !topicSet) return ack?.({ ok: false, message: "반과 저장된 목록을 확인하세요." });
    ensureClassShape(klass);
    klass.topics.push(...topicSet.topics.map((topic) => makeTopic(topic)));
    saveStore();
    emitAll();
    ack?.({ ok: true, count: topicSet.topics.length });
  });

  socket.on("teacher:delete-topic-set", ({ setId }, ack) => {
    const before = store.topicSets.length;
    store.topicSets = store.topicSets.filter((item) => item.id !== setId);
    if (store.topicSets.length === before) return ack?.({ ok: false, message: "저장된 목록을 찾을 수 없습니다." });
    saveStore();
    emitAll();
    ack?.({ ok: true });
  });

  socket.on("teacher:remove-topic", ({ classId, topicId }) => {
    const klass = getClass(classId);
    if (!klass) return;
    klass.topics = klass.topics.filter((topic) => topic.id !== topicId);
    if (klass.selectedTopicId === topicId) {
      klass.selectedTopicId = null;
      klass.answerVisible = false;
    }
    saveStore();
    emitAll();
  });

  socket.on("teacher:set-representative", ({ classId, topicId, type }) => {
    const topic = getClass(classId)?.topics.find((item) => item.id === topicId);
    if (topic && ["mean", "median", "mode", "auto"].includes(type)) topic.representativeType = type === "auto" ? null : type;
    saveStore();
    emitAll();
  });

  socket.on("teacher:start-game", ({ classId }) => {
    const klass = getClass(classId);
    if (!klass) return;
    ensureClassShape(klass);
    klass.gameStarted = true;
    saveStore();
    emitAll();
  });

  socket.on("teacher:roulette-start", ({ classId }) => {
    const klass = getClass(classId);
    if (!klass) return;
    io.to(klass.id).emit("class:roulette-start");
  });

  socket.on("teacher:random-topic", ({ classId }, ack) => {
    const klass = getClass(classId);
    if (!klass) return ack?.({ ok: false, message: "반을 찾을 수 없습니다." });
    ensureClassShape(klass);
    const topicsWithEntries = klass.topics.filter((topic) => topic.entries.length > 0);
    const usedIds = new Set(klass.usedTopicIds);
    const available = topicsWithEntries.filter((topic) => !usedIds.has(topic.id));
    if (!topicsWithEntries.length) return ack?.({ ok: false, message: "입력된 자료가 있는 주제가 없습니다." });
    if (!available.length) return ack?.({ ok: false, message: "이번 게임에서 모든 주제를 이미 뽑았습니다. 점수 초기화 후 다시 시작하세요." });
    klass.selectedTopicId = available[Math.floor(Math.random() * available.length)].id;
    klass.usedTopicIds.push(klass.selectedTopicId);
    klass.gameStarted = true;
    klass.answerVisible = false;
    klass.roundEndsAt = Date.now() + ROUND_SECONDS * 1000;
    klass.roundPaused = false;
    klass.roundRemainingMs = null;
    klass.roundId += 1;
    const topic = selectedTopic(klass);
    if (topic) topic.predictions = [];
    saveStore();
    emitAll();
    scheduleRoundReveal(klass);
    ack?.({ ok: true, topicId: klass.selectedTopicId, topicName: topic?.name, roundEndsAt: klass.roundEndsAt });
  });

  socket.on("teacher:reveal-answer", ({ classId }, ack) => {
    const klass = getClass(classId);
    const topic = klass ? selectedTopic(klass) : null;
    if (!klass || !topic) return ack?.({ ok: false, message: "선택된 주제가 없습니다." });
    const payload = revealAnswerForClass(klass);
    ack?.({ ok: true, ...payload });
  });

  socket.on("teacher:toggle-round-pause", ({ classId }, ack) => {
    const klass = getClass(classId);
    const topic = klass ? selectedTopic(klass) : null;
    if (!klass || !topic || klass.answerVisible) return ack?.({ ok: false, message: "진행 중인 문제가 없습니다." });
    ensureClassShape(klass);
    if (klass.roundPaused) {
      const remaining = Math.max(0, klass.roundRemainingMs || ROUND_SECONDS * 1000);
      klass.roundEndsAt = Date.now() + remaining;
      klass.roundRemainingMs = null;
      klass.roundPaused = false;
      scheduleRoundReveal(klass);
    } else {
      klass.roundRemainingMs = Math.max(0, (klass.roundEndsAt || Date.now()) - Date.now());
      klass.roundEndsAt = null;
      klass.roundPaused = true;
      if (roundTimers.has(klass.id)) {
        clearTimeout(roundTimers.get(klass.id));
        roundTimers.delete(klass.id);
      }
    }
    saveStore();
    emitAll();
    ack?.({ ok: true, paused: klass.roundPaused, roundEndsAt: klass.roundEndsAt, roundRemainingMs: klass.roundRemainingMs });
  });

  socket.on("teacher:reset-scores", ({ classId }) => {
    const klass = getClass(classId);
    if (!klass) return;
    klass.scores = {};
    for (const team of klass.teams) klass.scores[team] = 0;
    klass.roundHistory = [];
    klass.usedTopicIds = [];
    saveStore();
    emitAll();
  });

  socket.on("student:create-team", ({ classId, team }, ack) => {
    const klass = getClass(classId);
    const teamName = clean(team, 20);
    if (!klass || !teamName) return ack?.({ ok: false, message: "반과 조 이름을 확인하세요." });
    if (!klass.teams.some((item) => item.toLowerCase() === teamName.toLowerCase())) klass.teams.push(teamName);
    if (!(teamName in klass.scores)) klass.scores[teamName] = 0;
    saveStore();
    emitAll();
    ack?.({ ok: true, team: teamName });
  });

  socket.on("student:join-profile", ({ classId, team, studentNumber, studentName, previousKey, previousTeam }, ack) => {
    const klass = getClass(classId);
    const teamName = clean(team, 20);
    const number = clean(studentNumber, 8);
    const name = clean(studentName, 24);
    if (!klass || !teamName || !number || !name) return ack?.({ ok: false, message: "반, 조, 번호, 이름을 확인하세요." });
    ensureClassShape(klass);
    if (!klass.teams.includes(teamName)) klass.teams.push(teamName);
    if (!(teamName in klass.scores)) klass.scores[teamName] = 0;
    const key = studentKey(number, name);
    const previous = klass.students.find((student) => student.key === clean(previousKey, 80) && student.team === clean(previousTeam || teamName, 20))
      || klass.students.find((student) => student.socketId === socket.id)
      || null;
    const existing = klass.students.find((student) => student.key === key && student.team === teamName);
    const target = existing || previous;
    if (target) {
      if (existing && previous && existing !== previous) updateStudentReferences(klass, { key: previous.key, team: previous.team }, existing);
      const before = { key: target.key, team: target.team };
      target.key = key;
      target.team = teamName;
      target.studentNumber = number;
      target.studentName = name;
      target.lastSeenAt = Date.now();
      target.connected = true;
      target.socketId = socket.id;
      updateStudentReferences(klass, before, target);
      if (existing && previous && existing !== previous) klass.students = klass.students.filter((student) => student !== previous);
    } else {
      klass.students.push({ key, team: teamName, studentNumber: number, studentName: name, connected: true, socketId: socket.id, lastSeenAt: Date.now() });
    }
    socket.data.classId = klass.id;
    socket.data.studentKey = key;
    socket.data.team = teamName;
    for (const topic of klass.topics) {
      for (const prediction of topic.predictions || []) {
        if (prediction.team === teamName) prediction.confirmed = isMajority(klass, teamName, prediction.approvals || []);
      }
    }
    saveStore();
    emitAll();
    ack?.({ ok: true, key, team: teamName });
  });

  socket.on("teacher:end-game", ({ classId }, ack) => {
    const klass = getClass(classId);
    if (!klass) return ack?.({ ok: false, message: "반을 찾을 수 없습니다." });
    ensureClassShape(klass);
    klass.gameStarted = false;
    klass.selectedTopicId = null;
    klass.answerVisible = false;
    klass.roundEndsAt = null;
    klass.roundPaused = false;
    klass.roundRemainingMs = null;
    if (roundTimers.has(klass.id)) {
      clearTimeout(roundTimers.get(klass.id));
      roundTimers.delete(klass.id);
    }
    for (const topic of klass.topics) topic.predictions = [];
    saveStore();
    emitAll();
    ack?.({ ok: true });
  });

  socket.on("teacher:delete-student", ({ classId, key, team }, ack) => {
    const klass = getClass(classId);
    if (!klass) return ack?.({ ok: false, message: "반을 찾을 수 없습니다." });
    ensureClassShape(klass);
    const student = klass.students.find((item) => item.key === key && item.team === team);
    if (!student) return ack?.({ ok: false, message: "학생을 찾을 수 없습니다." });
    klass.students = klass.students.filter((item) => !(item.key === key && item.team === team));
    const [studentNumber, ...nameParts] = key.split("-");
    const studentName = nameParts.join("-");
    for (const topic of klass.topics) {
      topic.entries = topic.entries.filter((entry) => !(entry.team === team && entry.studentNumber === studentNumber && entry.studentName === studentName));
      topic.predictions = (topic.predictions || []).filter((prediction) => prediction.team !== team || prediction.proposedBy !== key);
      for (const prediction of topic.predictions || []) {
        prediction.approvals = (prediction.approvals || []).filter((approval) => approval !== key);
        prediction.confirmed = isMajority(klass, prediction.team, prediction.approvals);
      }
    }
    saveStore();
    emitAll();
    ack?.({ ok: true });
  });

  socket.on("student:submit-value", ({ classId, topicId, studentNumber, studentName, team, value }, ack) => {
    const klass = getClass(classId);
    const topic = klass?.topics.find((item) => item.id === topicId);
    const number = clean(studentNumber, 8);
    const name = clean(studentName, 24);
    const teamName = clean(team, 20);
    const submittedValue = topic?.allowText ? clean(value, 80) : Number(value);
    if (!klass || !topic || !number || !name || !teamName || (topic.allowText ? !submittedValue : !Number.isFinite(submittedValue))) return ack?.({ ok: false, message: topic?.allowText ? "반, 조, 번호, 이름, 값을 모두 입력하세요." : "반, 조, 번호, 이름, 숫자 값을 모두 입력하세요." });
    if (!klass.teams.includes(teamName)) klass.teams.push(teamName);
    const existing = topic.entries.find((entry) => entry.studentNumber === number && entry.studentName === name && entry.team === teamName);
    if (existing) existing.value = submittedValue;
    else topic.entries.push({ id: uid(), studentNumber: number, studentName: name, team: teamName, value: submittedValue, createdAt: Date.now() });
    if (!(teamName in klass.scores)) klass.scores[teamName] = 0;
    saveStore();
    emitAll();
    ack?.({ ok: true });
  });

  socket.on("student:submit-prediction", ({ classId, team, entryId, explanation, studentNumber, studentName }, ack) => {
    const klass = getClass(classId);
    const topic = klass ? selectedTopic(klass) : null;
    const teamName = clean(team, 20);
    const entry = topic?.entries.find((item) => item.id === entryId && item.team === teamName);
    if (!klass || !topic || !teamName || !entry) return ack?.({ ok: false, message: "선택된 반, 주제, 조의 학생을 확인하세요." });
    ensureClassShape(klass);
    const proposerKey = studentKey(studentNumber, studentName);
    const prediction = { team: teamName, entryId, explanation: clean(explanation, 160), proposedBy: proposerKey, approvals: [proposerKey], confirmed: false, at: Date.now() };
    prediction.confirmed = isMajority(klass, teamName, prediction.approvals);
    const index = topic.predictions.findIndex((item) => item.team === teamName);
    if (index >= 0) topic.predictions[index] = prediction;
    else topic.predictions.push(prediction);
    if (!(teamName in klass.scores)) klass.scores[teamName] = 0;
    saveStore();
    emitAll();
    ack?.({ ok: true, confirmed: prediction.confirmed, needed: requiredApprovals(klass, teamName), approvals: prediction.approvals.length });
  });

  socket.on("student:change-prediction", ({ classId, team, entryId, explanation, studentNumber, studentName }, ack) => {
    const klass = getClass(classId);
    const topic = klass ? selectedTopic(klass) : null;
    const teamName = clean(team, 20);
    const entry = topic?.entries.find((item) => item.id === entryId && item.team === teamName);
    if (!klass || !topic || !teamName || !entry) return ack?.({ ok: false, message: "변경할 대표 학생을 확인하세요." });
    ensureClassShape(klass);
    const proposerKey = studentKey(studentNumber, studentName);
    const prediction = topic.predictions.find((item) => item.team === teamName);
    const next = { team: teamName, entryId, explanation: clean(explanation, 160), proposedBy: proposerKey, approvals: [proposerKey], at: Date.now() };
    if (prediction) {
      prediction.changeProposal = next;
      prediction.confirmed = true;
    } else {
      topic.predictions.push({ team: teamName, ...next, confirmed: isMajority(klass, teamName, next.approvals) });
    }
    saveStore();
    emitAll();
    ack?.({ ok: true, needed: requiredApprovals(klass, teamName), approvals: 1 });
  });

  socket.on("student:approve-prediction", ({ classId, team, studentNumber, studentName }, ack) => {
    const klass = getClass(classId);
    const topic = klass ? selectedTopic(klass) : null;
    const teamName = clean(team, 20);
    const prediction = topic?.predictions.find((item) => item.team === teamName);
    if (!klass || !topic || !prediction) return ack?.({ ok: false, message: "동의할 대표 제안이 없습니다." });
    const key = studentKey(studentNumber, studentName);
    const target = prediction.changeProposal || prediction;
    if (!target.approvals.includes(key)) target.approvals.push(key);
    if (prediction.changeProposal && isMajority(klass, teamName, target.approvals)) {
      prediction.entryId = target.entryId;
      prediction.explanation = target.explanation;
      prediction.proposedBy = target.proposedBy;
      prediction.approvals = target.approvals;
      prediction.at = target.at;
      prediction.confirmed = true;
      delete prediction.changeProposal;
    } else {
      prediction.confirmed = isMajority(klass, teamName, prediction.approvals);
    }
    saveStore();
    emitAll();
    ack?.({ ok: true, confirmed: prediction.confirmed && !prediction.changeProposal, changed: !prediction.changeProposal && prediction.entryId === target.entryId, needed: requiredApprovals(klass, teamName), approvals: target.approvals.length });
  });

  socket.on("disconnect", () => {
    const klass = getClass(socket.data.classId);
    if (!klass || !socket.data.studentKey) return;
    ensureClassShape(klass);
    const student = klass.students.find((item) => item.key === socket.data.studentKey && item.team === socket.data.team);
    if (student && student.socketId === socket.id) {
      student.connected = false;
      student.lastSeenAt = Date.now();
      delete student.socketId;
      saveStore();
      emitAll();
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Teacher: http://localhost:${PORT}/teacher`);
  console.log(`Student: http://localhost:${PORT}/student`);
  for (const url of classroomUrls()) console.log(`Classroom: ${url}`);
});
