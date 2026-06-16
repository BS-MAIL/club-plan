const $ = (id) => document.getElementById(id);

const scenarioText = {
  allowance: { unit: "원", label: "용돈", sentence: (n, v) => `${n}일 뒤 용돈은 ${fmt(v)}원입니다.` },
  cells: { unit: "개", label: "세포", sentence: (n, v) => `${n}번째 관찰에서 세포 수는 약 ${fmt(v)}개입니다.` },
  views: { unit: "회", label: "조회수", sentence: (n, v) => `${n}단계 뒤 조회수는 ${fmt(v)}회입니다.` },
  discount: { unit: "원", label: "가격", sentence: (n, v) => `${n}번 변화 후 가격은 ${fmt(v)}원입니다.` },
  halfLife: { unit: "g", label: "남은 양", sentence: (n, v) => `${n}번째 측정에서 남은 양은 ${fmt(v)}g입니다.` },
  rumor: { unit: "명", label: "들은 사람", sentence: (n, v) => `${n}단계 뒤 소문을 들은 사람은 약 ${fmt(v)}명입니다.` },
};

const missions = [
  { title: "용돈 두 배 챌린지", desc: "10일 뒤 100,000원 이상 만들기", term: 10, test: (v) => v >= 100000, concept: "r > 1이면 뒤쪽 항이 빠르게 커집니다." },
  { title: "할인 마스터", desc: "5번 변화 후 가격을 30,000원 이하로 낮추기", term: 5, test: (v) => v <= 30000 && v >= 0, concept: "0 < r < 1이면 값이 줄어듭니다." },
  { title: "소문 확산 막기", desc: "7단계 후 1,000명 이하로 제한하기", term: 7, test: (v) => v <= 1000, concept: "공비를 조절하면 확산 속도를 낮출 수 있습니다." },
  { title: "반감기 탐구", desc: "6번째 항이 초항의 1/32에 가까워지게 하기", term: 6, test: (v, s) => Math.abs(v - s.first / 32) <= Math.max(1, Math.abs(s.first) * 0.03), concept: "공비 1/2은 매번 절반이 되는 상황입니다." },
];

let state = { first: 2, ratio: 2, count: 10, scenario: "allowance" };
let logs = JSON.parse(localStorage.getItem("geoLabLogs") || "[]");
let lastLogKey = "";

function fmt(value) {
  if (!Number.isFinite(value)) return "계산 범위 초과";
  const abs = Math.abs(value);
  if (abs !== 0 && abs >= 1e9) return value.toExponential(3);
  if (abs !== 0 && abs < 0.001) return value.toExponential(3);
  return Number(value.toFixed(4)).toLocaleString("ko-KR");
}

function powSup(value) {
  const map = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "n": "ⁿ" };
  return String(value).split("").map((c) => map[c] || c).join("");
}

function sequence() {
  return Array.from({ length: state.count }, (_, i) => state.first * Math.pow(state.ratio, i));
}

function logEvent(type, detail) {
  const entry = { time: new Date().toISOString(), type, first: state.first, ratio: state.ratio, count: state.count, scenario: state.scenario, detail };
  const key = `${type}:${JSON.stringify(detail)}:${state.first}:${state.ratio}:${state.count}:${state.scenario}`;
  if (key === lastLogKey) return;
  lastLogKey = key;
  logs.unshift(entry);
  logs = logs.slice(0, 80);
  localStorage.setItem("geoLabLogs", JSON.stringify(logs));
  renderLogs();
}

function syncInputs() {
  $("firstTerm").value = Math.max(-20, Math.min(100, state.first));
  $("firstTermNumber").value = state.first;
  $("ratio").value = Math.max(-3, Math.min(5, state.ratio));
  $("ratioNumber").value = state.ratio;
  $("termCount").value = state.count;
  $("scenario").value = state.scenario;
  $("firstTermOut").textContent = fmt(state.first);
  $("ratioOut").textContent = fmt(state.ratio);
  $("termCountOut").textContent = state.count;
}

function insight() {
  const r = state.ratio;
  if (r > 1) return "▲ 공비가 1보다 커서 뒤로 갈수록 값이 곱셈으로 증가합니다.";
  if (r > 0 && r < 1) return "▼ 공비가 0과 1 사이이므로 값이 점점 0에 가까워집니다.";
  if (r === 1) return "■ 공비가 1이라 모든 항이 초항과 같습니다.";
  if (r === 0) return "■ 두 번째 항부터는 모두 0입니다.";
  return "↕ 공비가 음수라 항의 부호가 번갈아 바뀝니다.";
}

function renderFormula(values) {
  $("formulaText").textContent = `aₙ = ${fmt(state.first)} × (${fmt(state.ratio)})${powSup("n-1")}`;
  $("patternText").textContent = `이전 항에 ${fmt(state.ratio)}을/를 곱합니다. 현재 마지막 항은 ${fmt(values.at(-1))}입니다.`;
}

function renderStory(values) {
  const s = scenarioText[state.scenario];
  $("storyText").textContent = s.sentence(state.count, values.at(-1));
  $("insightText").textContent = insight();
}

function renderTable(values) {
  $("sequenceTable").innerHTML = values.map((v, i) => {
    const rel = i === 0 ? "시작값" : `${fmt(values[i - 1])} × ${fmt(state.ratio)} = ${fmt(v)}`;
    return `<tr><td>${i + 1}</td><td>${fmt(v)}</td><td>${rel}</td></tr>`;
  }).join("");
}

function scale(values, height, pad) {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  return (v) => height - pad - ((v - min) / span) * (height - pad * 2);
}

function renderCharts(values) {
  const w = 520, h = 260, pad = 30;
  const y = scale(values, h, pad);
  const zeroY = y(0);
  const maxAbs = Math.max(...values.map((v) => Math.abs(v)), 1);
  const barW = Math.max(8, (w - pad * 2) / values.length - 6);
  const barSvg = [`<line class="axis" x1="${pad}" y1="${zeroY}" x2="${w - pad}" y2="${zeroY}"/><text x="${pad}" y="20">막대그래프</text>`];
  values.forEach((v, i) => {
    const x = pad + i * ((w - pad * 2) / values.length) + 3;
    const bh = Math.max(2, Math.abs(y(v) - zeroY));
    const top = v >= 0 ? y(v) : zeroY;
    barSvg.push(`<rect class="${v >= 0 ? "bar-positive" : "bar-negative"}" x="${x}" y="${top}" width="${barW}" height="${bh}"><title>${i + 1}항: ${fmt(v)}</title></rect>`);
    if (i % 2 === 0) barSvg.push(`<text x="${x}" y="${h - 8}" font-size="11">${i + 1}</text>`);
  });
  $("barChart").setAttribute("viewBox", `0 0 ${w} ${h}`);
  $("barChart").innerHTML = barSvg.join("");

  const step = (w - pad * 2) / Math.max(1, values.length - 1);
  const points = values.map((v, i) => [pad + i * step, y(v)]);
  const path = points.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const lineSvg = [`<line class="zero-line" x1="${pad}" y1="${zeroY}" x2="${w - pad}" y2="${zeroY}"/><path class="line-path" d="${path}"/><text x="${pad}" y="20">점그래프/선그래프</text>`];
  points.forEach(([x, yy], i) => lineSvg.push(`<circle class="point" cx="${x}" cy="${yy}" r="5"><title>${i + 1}항: ${fmt(values[i])}, 최대 절댓값 대비 ${fmt(Math.abs(values[i]) / maxAbs * 100)}%</title></circle>`));
  $("lineChart").setAttribute("viewBox", `0 0 ${w} ${h}`);
  $("lineChart").innerHTML = lineSvg.join("");
}

function renderTargetOptions() {
  const current = $("targetTerm").value || "5";
  $("targetTerm").innerHTML = Array.from({ length: state.count }, (_, i) => `<option value="${i + 1}">a_${i + 1}</option>`).join("");
  $("targetTerm").value = Math.min(Number(current), state.count);
}

function renderMissions(values) {
  $("missionList").innerHTML = missions.map((m, i) => {
    const value = state.first * Math.pow(state.ratio, m.term - 1);
    const ok = m.test(value, state);
    return `<article class="mission-card">
      <h3>${m.title}</h3>
      <p>${m.desc}</p>
      <p><strong>${m.term}번째 항:</strong> ${fmt(value)}</p>
      <p>${m.concept}</p>
      <span class="status ${ok ? "success" : "try"}">${ok ? "✓ 달성" : "↻ 조정 필요"}</span>
      <button type="button" class="secondary mission-log" data-index="${i}">이 결과 기록</button>
    </article>`;
  }).join("");
  document.querySelectorAll(".mission-log").forEach((btn) => btn.addEventListener("click", () => {
    const m = missions[Number(btn.dataset.index)];
    const value = state.first * Math.pow(state.ratio, m.term - 1);
    logEvent("mission", { mission: m.title, term: m.term, value: fmt(value), success: m.test(value, state) });
  }));
}

function renderLogs() {
  $("logList").innerHTML = logs.length ? logs.slice(0, 20).map((l) => {
    const date = new Date(l.time).toLocaleString("ko-KR");
    return `<li><strong>${date}</strong> · ${l.type} · a₁=${fmt(l.first)}, r=${fmt(l.ratio)}, n=${l.count}<br><span>${JSON.stringify(l.detail, null, 0)}</span></li>`;
  }).join("") : "<li>아직 기록이 없습니다. 값을 바꾸거나 예측·미션 결과를 기록해 보세요.</li>";
}

function render() {
  syncInputs();
  const values = sequence();
  renderFormula(values);
  renderStory(values);
  renderTable(values);
  renderCharts(values);
  renderTargetOptions();
  renderMissions(values);
  logEvent("change", { message: "값 조작", lastTerm: fmt(values.at(-1)) });
}

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function toCsv() {
  const header = ["time", "type", "first", "ratio", "count", "scenario", "detail"];
  const rows = logs.map((l) => header.map((k) => `"${String(k === "detail" ? JSON.stringify(l.detail) : l[k]).replaceAll('"', '""')}"`).join(","));
  return [header.join(","), ...rows].join("\n");
}

function bind() {
  $("firstTerm").addEventListener("input", (e) => setState({ first: Number(e.target.value) }));
  $("firstTermNumber").addEventListener("change", (e) => setState({ first: Number(e.target.value) }));
  $("ratio").addEventListener("input", (e) => setState({ ratio: Number(e.target.value) }));
  $("ratioNumber").addEventListener("change", (e) => setState({ ratio: Number(e.target.value) }));
  $("termCount").addEventListener("input", (e) => setState({ count: Number(e.target.value) }));
  $("scenario").addEventListener("change", (e) => setState({ scenario: e.target.value }));
  $("checkPredictionBtn").addEventListener("click", () => {
    const term = Number($("targetTerm").value);
    const predicted = Number($("predictionInput").value);
    const actual = state.first * Math.pow(state.ratio, term - 1);
    if (!Number.isFinite(predicted)) {
      $("predictionResult").textContent = "예측값을 숫자로 입력해 주세요.";
      return;
    }
    const error = Math.abs(predicted - actual);
    const ok = error <= Math.max(0.0001, Math.abs(actual) * 0.01);
    $("predictionResult").innerHTML = `<strong>${ok ? "거의 맞았습니다." : "다시 비교해 보세요."}</strong><br>정답: ${fmt(actual)} / 내 예측: ${fmt(predicted)} / 오차: ${fmt(error)}<br>힌트: a_${term} = ${fmt(state.first)} × (${fmt(state.ratio)})${powSup(term - 1)} 입니다.`;
    logEvent("prediction", { term, predicted, actual: fmt(actual), error: fmt(error), memo: $("ruleMemo").value.trim() });
  });
  $("largeTextBtn").addEventListener("click", () => {
    document.body.classList.toggle("large-text");
    $("largeTextBtn").textContent = document.body.classList.contains("large-text") ? "큰 글씨 끄기" : "큰 글씨 켜기";
  });
  $("copyResultBtn").addEventListener("click", async () => {
    const values = sequence();
    const text = `등비수열 결과\na₁=${state.first}, r=${state.ratio}, n=${state.count}\n일반항: ${$("formulaText").textContent}\n마지막 항: ${fmt(values.at(-1))}\n${insight()}`;
    await navigator.clipboard.writeText(text);
    $("copyResultBtn").textContent = "복사 완료";
    setTimeout(() => $("copyResultBtn").textContent = "결과 복사", 1200);
  });
  $("downloadJsonBtn").addEventListener("click", () => download("geometric-lab-log.json", JSON.stringify(logs, null, 2), "application/json"));
  $("downloadCsvBtn").addEventListener("click", () => download("geometric-lab-log.csv", toCsv(), "text/csv;charset=utf-8"));
  $("clearLogBtn").addEventListener("click", () => {
    if (confirm("이 브라우저에 저장된 탐구 로그를 지울까요?")) {
      logs = [];
      localStorage.removeItem("geoLabLogs");
      renderLogs();
    }
  });
}

bind();
renderLogs();
render();
