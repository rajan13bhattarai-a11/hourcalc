// HourCalc Pro
// Rules:
// - Base rate default: 26.9797
// - Weekdays: +25% after loadingStart (default 6:30 PM)
// - Saturday: +25% ALL DAY
// - Sunday: +50% ALL DAY
// - Per shift: break minutes + dropdown "break before loading?" yes/no (weekdays only)
// - Auto-save to localStorage
// - Multiple shifts + weekly totals + export CSV

const DEFAULTS = {
  baseRate: 26.9797,
  loadH: 6,
  loadM: 30,
  loadAP: "PM",
  weekLabel: "",
  shifts: [
    {
      name: "Monday",
      didDM: "no",
      sh: 9, sm: 0, sap: "AM",
      eh: 5, em: 0, eap: "PM",
      breakMin: 0,
      breakBeforeLoading: "yes"
    }
  ]
};

const LS_KEY = "hourcalc_pro_v1";

// loading percentages
const WEEKDAY_LOADING_PCT = 0.25;
const SAT_LOADING_PCT = 0.25;
const SUN_LOADING_PCT = 0.50;

const $ = (id) => document.getElementById(id);

const el = {
  chipBase: $("chipBase"),
  weekLabel: $("weekLabel"),
  baseRate: $("baseRate"),
  loadH: $("loadH"),
  loadM: $("loadM"),
  loadAP: $("loadAP"),
  shiftList: $("shiftList"),
  btnAddShift: $("btnAddShift"),
  btnCalculate: $("btnCalculate"),
  btnExportCSV: $("btnExportCSV"),
  btnReset: $("btnReset"),
  toast: $("toast"),
  pillStatus: $("pillStatus"),

  sumTotalPay: $("sumTotalPay"),
  sumSubtitle: $("sumSubtitle"),
  sumTotalHours: $("sumTotalHours"),
  sumNormalHours: $("sumNormalHours"),
  sumLoadingHours: $("sumLoadingHours"),
  sumBaseRate: $("sumBaseRate"),
  sumLoadingRate: $("sumLoadingRate"),

  btnShowLink: $("btnShowLink"),
};

let state = loadState();

// ---------- time helpers ----------
function toMinutes12(h, m, ap) {
  let hh = Number(h), mm = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;

  const up = String(ap || "").toUpperCase();
  if (up === "AM") {
    if (hh === 12) hh = 0;
  } else if (up === "PM") {
    if (hh !== 12) hh += 12;
  } else return null;

  return hh * 60 + mm;
}

function fmtHM(mins) {
  mins = Math.round(mins);
  const sign = mins < 0 ? "-" : "";
  const a = Math.abs(mins);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `${sign}${h}h ${m}m`;
}

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}

// Split minutes into normal/loading for a single-day segment [start..end) where both are within 0..1440
function splitByLoading(startMin, endMin, loadingStartMin) {
  if (endMin <= loadingStartMin) return { normal: endMin - startMin, loading: 0 };
  if (startMin >= loadingStartMin) return { normal: 0, loading: endMin - startMin };
  return { normal: loadingStartMin - startMin, loading: endMin - loadingStartMin };
}

// -------- day helpers (robust) ----------
function normDayName(v) {
  return String(v || "").trim().toLowerCase(); // trims spaces, handles "Sunday " etc.
}
function dayFlags(dayName) {
  const d = normDayName(dayName);
  return {
    isSaturday: d === "saturday",
    isSunday: d === "sunday",
    isWeekend: d === "saturday" || d === "sunday"
  };
}

// ---------- state ----------
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);

    const merged = structuredClone(DEFAULTS);
    merged.baseRate = Number(parsed.baseRate ?? merged.baseRate);
    merged.loadH = Number(parsed.loadH ?? merged.loadH);
    merged.loadM = Number(parsed.loadM ?? merged.loadM);
    merged.loadAP = String(parsed.loadAP ?? merged.loadAP);
    merged.weekLabel = String(parsed.weekLabel ?? merged.weekLabel);

    if (Array.isArray(parsed.shifts) && parsed.shifts.length) {
      merged.shifts = parsed.shifts.map((s, i) => ({
        name: String(s.name ?? `Shift ${i + 1}`),
        didDM: (String(s.didDM || "").toLowerCase() === "yes") ? "yes" : "no",
        sh: Number(s.sh ?? 9), sm: Number(s.sm ?? 0), sap: String(s.sap ?? "AM"),
        eh: Number(s.eh ?? 5), em: Number(s.em ?? 0), eap: String(s.eap ?? "PM"),
        breakMin: Math.max(0, Number(s.breakMin ?? 0)),
        breakBeforeLoading: (s.breakBeforeLoading === "no") ? "no" : "yes"
      }));
    }

    return merged;
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let toastTimer = null;
function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  showToast("Saved ✓");
}

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 1100);
}

function setStatus(text) {
  el.pillStatus.textContent = text;
}

// ---------- UI render ----------
function render() {
  el.weekLabel.value = state.weekLabel || "";
  el.baseRate.value = String(state.baseRate);
  el.loadH.value = String(state.loadH);
  el.loadM.value = String(state.loadM);
  el.loadAP.value = state.loadAP;

  el.chipBase.textContent = String(state.baseRate);

  el.shiftList.innerHTML = "";
  state.shifts.forEach((s, idx) => {
    el.shiftList.appendChild(renderShiftCard(s, idx));
  });
}

function renderShiftCard(s, idx) {
  const wrap = document.createElement("div");
  wrap.className = "shift";
  wrap.dataset.index = String(idx);

  wrap.innerHTML = `
    <div class="shiftTop">
      <div>
        <div class="shiftTitle">${escapeHtml(s.name || `Shift ${idx + 1}`)}</div>
        <div class="mini">Weekdays split at loading time • Sat/Sun all-day loading</div>
      </div>
      <button class="btn btnDanger" type="button" data-action="remove">Remove</button>
    </div>

    <div class="row" style="margin-top:6px">
      <div>
        <label>Day</label>
        <select data-k="name">
          ${["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(d =>
            `<option value="${d}" ${String(s.name)===d?"selected":""}>${d}</option>`
          ).join("")}
        </select>
      </div>

      <div>
        <label>Did you do DM?</label>
        <select data-k="didDM">
          <option value="no" ${s.didDM==="no"?"selected":""}>No</option>
          <option value="yes" ${s.didDM==="yes"?"selected":""}>Yes</option>
        </select>
      </div>
    </div>

    <div class="row" style="margin-top:6px">
      <div>
        <label>Start time</label>
        <div class="row3">
          <input data-k="sh" type="number" min="1" max="12" value="${s.sh}">
          <input data-k="sm" type="number" min="0" max="59" value="${s.sm}">
          <select data-k="sap">
            <option ${s.sap==="AM"?"selected":""}>AM</option>
            <option ${s.sap==="PM"?"selected":""}>PM</option>
          </select>
        </div>
      </div>

      <div>
        <label>End time</label>
        <div class="row3">
          <input data-k="eh" type="number" min="1" max="12" value="${s.eh}">
          <input data-k="em" type="number" min="0" max="59" value="${s.em}">
          <select data-k="eap">
            <option ${s.eap==="AM"?"selected":""}>AM</option>
            <option ${s.eap==="PM"?"selected":""}>PM</option>
          </select>
        </div>
      </div>
    </div>

    <div class="row" style="margin-top:6px">
      <div>
        <label>Break (minutes)</label>
        <input data-k="breakMin" type="number" min="0" value="${s.breakMin}">
      </div>
      <div>
        <label>Did you take break before loading time?</label>
        <select data-k="breakBeforeLoading">
          <option value="yes" ${s.breakBeforeLoading==="yes"?"selected":""}>Yes</option>
          <option value="no" ${s.breakBeforeLoading==="no"?"selected":""}>No</option>
        </select>
      </div>
    </div>
  `;

  wrap.addEventListener("input", (e) => {
    const t = e.target;
    const k = t?.dataset?.k;
    if (!k) return;

    const i = Number(wrap.dataset.index);
    const shift = state.shifts[i];
    if (!shift) return;

    if (k === "name") shift.name = t.value;
    if (k === "didDM") shift.didDM = (t.value === "yes") ? "yes" : "no";
    if (k === "sh") shift.sh = Number(t.value || 0);
    if (k === "sm") shift.sm = Number(t.value || 0);
    if (k === "sap") shift.sap = t.value;
    if (k === "eh") shift.eh = Number(t.value || 0);
    if (k === "em") shift.em = Number(t.value || 0);
    if (k === "eap") shift.eap = t.value;
    if (k === "breakMin") shift.breakMin = Math.max(0, Number(t.value || 0));
    if (k === "breakBeforeLoading") shift.breakBeforeLoading = (t.value === "no") ? "no" : "yes";

    saveState();
  });

  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='remove']");
    if (!btn) return;
    const i = Number(wrap.dataset.index);
    state.shifts.splice(i, 1);
    if (state.shifts.length === 0) state.shifts.push(structuredClone(DEFAULTS.shifts[0]));
    saveState();
    render();
    setStatus("Shift removed");
  });

  return wrap;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

// ---------- calculation ----------
function calculateTotals() {
  const baseRate = Math.max(0, Number(el.baseRate.value || DEFAULTS.baseRate));

  const loadStart = toMinutes12(el.loadH.value, el.loadM.value, el.loadAP.value);
  if (loadStart === null) {
    setStatus("Fix loading time");
    return { ok:false, err:"Invalid loading start time" };
  }

  let totalNormalMins = 0;
  let totalLoadingMins = 0;

  let totalNormalPay = 0;
  let totalLoadingPay = 0;

  const perShift = [];

  for (let i = 0; i < state.shifts.length; i++) {
    const s = state.shifts[i];

    const start = toMinutes12(s.sh, s.sm, s.sap);
    const end0  = toMinutes12(s.eh, s.em, s.eap);
    if (start === null || end0 === null) {
      return { ok:false, err:`Invalid time in ${s.name || `Shift ${i+1}`}` };
    }

    let end = end0;
    if (end < start) end += 1440; // overnight

    const { isSaturday, isSunday, isWeekend } = dayFlags(s.name);

    const loadingPct = isSunday ? SUN_LOADING_PCT : (isSaturday ? SAT_LOADING_PCT : WEEKDAY_LOADING_PCT);

    let normalM = 0, loadingM = 0;

    function processSegment(segStart, segEnd, dayOffset) {
      const a = segStart - dayOffset;
      const b = segEnd - dayOffset;

      if (isWeekend) {
        loadingM += (b - a);
      } else {
        const split = splitByLoading(a, b, loadStart);
        normalM += split.normal;
        loadingM += split.loading;
      }
    }

    if (end <= 1440) {
      processSegment(start, end, 0);
    } else {
      processSegment(start, 1440, 0);
      processSegment(1440, end, 1440);
    }

    const breakMin = Math.max(0, Number(s.breakMin || 0));
    if (isWeekend) {
      loadingM = Math.max(0, loadingM - breakMin);
    } else {
      if (s.breakBeforeLoading === "yes") {
        normalM = Math.max(0, normalM - breakMin);
      } else {
        loadingM = Math.max(0, loadingM - breakMin);
      }
    }

    totalNormalMins += normalM;
    totalLoadingMins += loadingM;

    const shiftLoadingRate = baseRate * (1 + loadingPct);
    totalNormalPay += (normalM / 60) * baseRate;
    totalLoadingPay += (loadingM / 60) * shiftLoadingRate;

    perShift.push({
      name: s.name || `Shift ${i+1}`,
      normalMins: normalM,
      loadingMins: loadingM,
      totalMins: normalM + loadingM,
      breakMin
    });
  }

  const loadingRateWeekday = baseRate * 1.25;
  const loadingRateSunday  = baseRate * 1.50;

  const normalPay = totalNormalPay;
  const loadingPay = totalLoadingPay;
  const totalPay = normalPay + loadingPay;

  return {
    ok:true,
    baseRate,
    loadingRateWeekday,
    loadingRateSunday,
    normalMins: totalNormalMins,
    loadingMins: totalLoadingMins,
    totalMins: totalNormalMins + totalLoadingMins,
    normalPay,
    loadingPay,
    totalPay,
    perShift
  };
}

function updateSummary(out) {
  if (!out.ok) {
    setStatus("Error");
    el.sumTotalPay.textContent = "$0.00";
    el.sumSubtitle.textContent = out.err || "Fix inputs and try again.";
    return;
  }

  setStatus("Calculated");
  el.sumTotalPay.textContent = money(out.totalPay);

  const label = (el.weekLabel.value || "").trim();
  const labelText = label ? `Week: ${label} • ` : "";
  el.sumSubtitle.textContent = `${labelText}${state.shifts.length} shift(s) • Sat all-day 25% • Sun all-day 50%`;

  el.sumTotalHours.textContent = fmtHM(out.totalMins);
  el.sumNormalHours.textContent = fmtHM(out.normalMins);
  el.sumLoadingHours.textContent = fmtHM(out.loadingMins);

  el.sumBaseRate.textContent = `${money(out.baseRate)}/hr`;
  el.sumLoadingRate.textContent =
    `${money(out.loadingRateWeekday)}/hr (25%) • ${money(out.loadingRateSunday)}/hr (50%)`;
}

// ---------- CSV export ----------
function exportCSV(out) {
  if (!out.ok) {
    alert(out.err || "Fix inputs first.");
    return;
  }

  const rows = [];
  rows.push(["WeekLabel", (el.weekLabel.value || "").trim()]);
  rows.push(["BaseRate", out.baseRate]);
  rows.push(["LoadingRateWeekday_25pct", out.loadingRateWeekday]);
  rows.push(["LoadingRateSunday_50pct", out.loadingRateSunday]);
  rows.push([]);
  rows.push(["ShiftName", "NormalMins", "LoadingMins", "TotalMins", "BreakMins"]);

  out.perShift.forEach(s => {
    rows.push([s.name, s.normalMins, s.loadingMins, s.totalMins, s.breakMin]);
  });

  rows.push([]);
  rows.push(["Totals", out.normalMins, out.loadingMins, out.totalMins, ""]);
  rows.push(["PayNormal", out.normalPay]);
  rows.push(["PayLoading", out.loadingPay]);
  rows.push(["PayTotal", out.totalPay]);

  const csv = rows.map(r => r.map(v => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
    return s;
  }).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `HourCalc_${(labelSafe(el.weekLabel.value) || "week")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  setStatus("CSV exported");
}
function labelSafe(s){
  return String(s || "").trim().replace(/[^\w\-]+/g, "_").slice(0,40);
}

// ---------- events ----------
function wire() {
  el.weekLabel.addEventListener("input", () => { state.weekLabel = el.weekLabel.value; saveState(); });
  el.baseRate.addEventListener("input", () => {
    state.baseRate = Number(el.baseRate.value || DEFAULTS.baseRate);
    el.chipBase.textContent = String(state.baseRate);
    saveState();
  });

  const onLoadTime = () => {
    state.loadH = Number(el.loadH.value || DEFAULTS.loadH);
    state.loadM = Number(el.loadM.value || DEFAULTS.loadM);
    state.loadAP = el.loadAP.value || DEFAULTS.loadAP;
    saveState();
  };
  el.loadH.addEventListener("input", onLoadTime);
  el.loadM.addEventListener("input", onLoadTime);
  el.loadAP.addEventListener("change", onLoadTime);

  el.btnAddShift.addEventListener("click", () => {
    state.shifts.push({
      name: "Monday",
      didDM: "no",
      sh: 9, sm: 0, sap: "AM",
      eh: 5, em: 0, eap: "PM",
      breakMin: 0,
      breakBeforeLoading: "yes"
    });
    saveState();
    render();
    setStatus("Shift added");
  });

  el.btnCalculate.addEventListener("click", () => {
    state.weekLabel = el.weekLabel.value;
    state.baseRate = Number(el.baseRate.value || DEFAULTS.baseRate);
    state.loadH = Number(el.loadH.value || DEFAULTS.loadH);
    state.loadM = Number(el.loadM.value || DEFAULTS.loadM);
    state.loadAP = el.loadAP.value || DEFAULTS.loadAP;
    saveState();

    const out = calculateTotals();
    updateSummary(out);
  });

  el.btnExportCSV.addEventListener("click", () => {
    const out = calculateTotals();
    exportCSV(out);
  });

  el.btnReset.addEventListener("click", () => {
    if (!confirm("Reset the entire week? This clears all shifts.")) return;
    state = structuredClone(DEFAULTS);
    saveState();
    render();
    updateSummary({
      ok:true,
      baseRate: state.baseRate,
      loadingRateWeekday: state.baseRate * 1.25,
      loadingRateSunday: state.baseRate * 1.50,
      normalMins:0, loadingMins:0, totalMins:0,
      normalPay:0, loadingPay:0, totalPay:0, perShift:[]
    });
    setStatus("Reset");
  });

  el.btnShowLink.addEventListener("click", () => {
    const url = `${location.origin}${location.pathname}`.replace(/\/[^/]*$/, "/apple.html");
    alert(url);
  });
}

// ---------- init ----------
function init() {
  render();
  updateSummary({
    ok:true,
    baseRate: state.baseRate,
    loadingRateWeekday: state.baseRate * 1.25,
    loadingRateSunday: state.baseRate * 1.50,
    normalMins:0, loadingMins:0, totalMins:0,
    normalPay:0, loadingPay:0, totalPay:0, perShift:[]
  });
  setStatus("Ready");
  wire();

  el.chipBase.textContent = String(state.baseRate);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    });
  }
}

init();