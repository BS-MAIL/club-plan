const socket = io();
let state = { classes: [], studentUrls: [], topicSets: [], classId: null, classRoom: null };
let currentClassId = localStorage.getItem("rv-class-id") || null;

const $ = (selector) => document.querySelector(selector);
const fmt = (value, unit = "") => value === null || value === undefined || Number.isNaN(value) ? "-" : `${value}${unit ? ` ${unit}` : ""}`;
const typeName = (type) => ({ mean: "평균", median: "중앙값", mode: "최빈값" }[type] || "자동");
const rankPoints = { 1: 3, 2: 2, 3: 1 };
const brandAliases = [["BHC", ["bhc", "b.h.c", "비에이치씨"]], ["교촌", ["교촌", "kyochon"]], ["BBQ", ["bbq", "비비큐"]], ["굽네", ["굽네", "goobne"]], ["처갓집", ["처갓집"]], ["네네", ["네네", "nene"]], ["푸라닭", ["푸라닭", "puradak"]], ["노랑통닭", ["노랑통닭"]], ["맥도날드", ["맥도날드", "맥날", "mcdonald", "mcdonalds"]], ["버거킹", ["버거킹", "burgerking"]], ["롯데리아", ["롯데리아", "lotteria"]], ["맘스터치", ["맘스터치", "momstouch"]]];
const compactText = (value) => String(value ?? "").trim().toLocaleLowerCase("ko-KR").replace(/[\s._\-·]+/g, "").replace(/[!?,~]/g, "");
const normalizeTextValue = (value) => {
  const compact = compactText(value);
  const brand = brandAliases.find(([, aliases]) => aliases.some((alias) => compact.includes(compactText(alias))));
  return brand ? brand[0] : compact;
};

function toast(message) {
  let box = $(".toast");
  if (!box) {
    box = document.createElement("div");
    box.className = "toast";
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.classList.add("show");
  setTimeout(() => box.classList.remove("show"), 1800);
}

function joinClass(classId) {
  if (!classId) return;
  socket.emit("class:join", { classId }, (res) => {
    if (!res?.ok) return toast(res?.message || "반 입장에 실패했습니다.");
    currentClassId = classId;
    localStorage.setItem("rv-class-id", classId);
    state = res.state;
    if (typeof afterClassJoin === "function") afterClassJoin();
    if (typeof render === "function") render();
  });
}

function selectedTopic() {
  return state.classRoom?.topics.find((topic) => topic.id === state.classRoom.selectedTopicId) || null;
}

function currentClassSummary() {
  return state.classes.find((klass) => klass.id === currentClassId) || null;
}

function roundResultFromState() {
  const topic = selectedTopic();
  const stats = topic?.stats;
  if (!state.classRoom || !topic || !stats) return null;
  const ranks = stats.selectedType === "mode" ? modeRankMap(topic) : null;
  const results = topic.predictions.filter((prediction) => prediction.confirmed).map((prediction) => {
    const entry = topic.entries.find((item) => item.id === prediction.entryId);
    const entryModeKey = entry && stats.selectedType === "mode" ? (topic.allowText ? normalizeTextValue(entry.value) : String(entry.value)) : null;
    const modeRank = entryModeKey ? ranks.get(entryModeKey)?.rank : null;
    const diff = entry
      ? stats.selectedType === "mode"
        ? (modeRank || Infinity) - 1
        : topic.allowText
        ? normalizeTextValue(entry.value) === normalizeTextValue(stats.representativeValue) ? 0 : 1
        : Math.abs(entry.value - stats.representativeValue)
      : Infinity;
    return { ...prediction, studentName: entry?.studentName || "삭제된 학생", studentNumber: entry?.studentNumber || "", diff: Math.round(diff * 100) / 100, modeRank };
  }).sort((a, b) => a.diff - b.diff || a.team.localeCompare(b.team, "ko"));
  const rankedResults = rankResults(results.filter((item) => Number.isFinite(item.diff)));
  const winner = rankedResults[0] || null;
  const rankings = rankedResults.filter((item) => item.points > 0).map((item) => ({ ...item, topicName: topic.name, unit: topic.unit, representativeType: stats.selectedType, representativeValue: stats.representativeValue, reason: stats.reason }));
  return {
    roundId: state.classRoom.roundId,
    topicName: topic.name,
    unit: topic.unit,
    stats,
    rankings,
    result: winner ? { ...winner, topicName: topic.name, unit: topic.unit, representativeType: stats.selectedType, representativeValue: stats.representativeValue, reason: stats.reason } : null,
  };
}

function modeRankMap(topic) {
  const groups = new Map();
  for (const entry of topic.entries || []) {
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

function rankResults(results) {
  let previousDiff = null;
  let currentRank = 0;
  return results.map((result, index) => {
    if (Number.isFinite(result.modeRank)) return { ...result, rank: result.modeRank, points: rankPoints[result.modeRank] || 0 };
    if (previousDiff === null || result.diff !== previousDiff) currentRank = index + 1;
    previousDiff = result.diff;
    return { ...result, rank: currentRank, points: rankPoints[currentRank] || 0 };
  });
}

function answerResultHtml(payload) {
  const rankings = payload?.rankings || (payload?.result ? [payload.result] : []);
  const stats = payload?.stats;
  const topicName = payload?.topicName || rankings[0]?.topicName || "-";
  const unit = payload?.unit || rankings[0]?.unit || "";
  const modeCount = stats?.selectedType === "mode" && stats.modeCount ? `<span class="answer-meta-chip">최빈값 ${stats.modeCount}회</span>` : "";
  const reason = stats?.reason || rankings[0]?.reason || "";
  const type = typeName(stats?.selectedType || rankings[0]?.representativeType);
  const value = fmt(stats?.representativeValue ?? rankings[0]?.representativeValue, unit);
  const answerHero = `<div class="answer-hero"><div><span>대푯값 종류</span><strong>${type}</strong></div><div><span>대푯값</span><b>${value}</b></div></div>`;
  if (!rankings.length) return `<div class="answer-summary"><b>${topicName}</b>${modeCount}</div>${answerHero}<div class="empty">아직 과반수로 확정된 조별 대표가 없습니다.</div><p class="answer-reason">${reason}</p>`;
  const rows = rankings.map((item, index) => {
    const rank = item.rank || index + 1;
    const points = item.points || rankPoints[rank] || 1;
    return `<div class="rank-card ${rank === 1 ? "rank-first" : ""}"><div class="rank-title"><b>${rank}등 : ${item.team}</b><span class="pill">+${points}점</span></div><div class="rank-detail"><span>대표학생 ${item.studentNumber}번 ${item.studentName}</span><span>차이 ${item.diff}</span></div></div>`;
  }).join("");
  return `<div class="answer-summary"><b>${topicName}</b>${modeCount}</div>${answerHero}<div class="rank-list">${rows}</div><p class="answer-reason">${reason}</p>`;
}

function statHtml(topic) {
  const stats = topic.stats;
  if (!stats) return `<div class="empty">아직 입력된 자료가 없습니다.</div>`;
  if (topic.allowText) {
    return `<div class="stat-grid text-stat-grid">
      <div class="stat"><span class="tiny">최빈값</span><b>${stats.mode.length ? stats.mode.map((v) => fmt(v, topic.unit)).join(", ") : "-"}</b></div>
      <div class="stat"><span class="tiny">빈도</span><b>${stats.modeCount}회</b></div>
      <div class="stat"><span class="tiny">자료 수</span><b>${stats.count}명</b></div>
    </div>`;
  }
  return `<div class="stat-grid">
    <div class="stat"><span class="tiny">평균</span><b>${fmt(stats.mean, topic.unit)}</b></div>
    <div class="stat"><span class="tiny">중앙값</span><b>${fmt(stats.median, topic.unit)}</b></div>
    <div class="stat"><span class="tiny">최빈값</span><b>${stats.mode.length ? stats.mode.map((v) => fmt(v, topic.unit)).join(", ") : "-"}</b></div>
    <div class="stat"><span class="tiny">자료 수</span><b>${stats.count}명</b></div>
  </div>`;
}

function classCards(onClickName = "selectClass") {
  if (!state.classes.length) return `<div class="empty">아직 개설된 반이 없습니다.</div>`;
  return state.classes.map((klass) => `<article class="topic-card class-choice-card ${klass.id === currentClassId ? "selected" : ""}" onclick="${onClickName}('${klass.id}')"><div><h3>${klass.name}</h3><p>${klass.topicCount}개 주제 · ${klass.studentCount}명 입력 · ${klass.teams.length}개 조</p></div>${typeof deleteClass === "function" ? `<button class="danger mini-btn" onclick="event.stopPropagation(); deleteClass('${klass.id}', '${klass.name.replace(/'/g, "\\'")}')">삭제</button>` : ""}</article>`).join("");
}

socket.on("state", (nextState) => {
  state = { ...state, classes: nextState.classes || [], studentUrls: nextState.studentUrls || [], topicSets: nextState.topicSets || [] };
  if (currentClassId && !state.classRoom) joinClass(currentClassId);
  if (typeof render === "function") render();
});

socket.on("class:state", (nextState) => {
  if (nextState.classId !== currentClassId) return;
  const prevRoundId = state.classRoom?.roundId;
  state = nextState;
  if (state.classRoom && prevRoundId !== undefined && state.classRoom.roundId !== prevRoundId && typeof onRoundChanged === "function") onRoundChanged();
  if (typeof render === "function") render();
});

socket.on("class:deleted", ({ classId }) => {
  if (classId !== currentClassId) return;
  currentClassId = null;
  localStorage.removeItem("rv-class-id");
  state = { ...state, classId: null, classRoom: null };
  if (typeof onClassDeleted === "function") onClassDeleted();
  if (typeof render === "function") render();
});
