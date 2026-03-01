// HourCalc Pro
// Rules:
// - Base rate default: 26.9797
// - Weekdays: +25% after loadingStart (FIXED 6:30 PM)
// - Saturday: +25% ALL DAY
// - Sunday: +50% ALL DAY
// - DM = Yes → different base rate ($30.3329) for that shift/day (silent; not shown in UI)
// - Per shift: break minutes + dropdown "break before loading?" yes/no (weekdays only)
// - Auto-save to localStorage
// - Export PDF uses browser print (Save as PDF)

const DEFAULTS = {
  baseRate: 26.9797,
  // kept for backward-compat with existing localStorage (even if UI removed)
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

// DM base rate (silent)
const DM_BASE_RATE = 30.3329;

// FIXED loading start time: 6:30 PM (weekdays only)
const FIXED_LOAD_START = { h: 6, m: 30, ap: "PM" };

const $ = (id) => document.getElementById(id);

const el = {
  chipBase: $("chipBase"),
  weekLabel: $("weekLabel"),
  baseRate: $("baseRate"),

  // these may not exist anymore; keep safe
  loadH: $("loadH"),
  loadM: $("loadM"),
  loadAP: $("loadAP"),

  shiftList: $("shiftList"),
  btnAddShift: $("btnAddShift"), // may not exist now (safe)
  btnCalculate: $("btnCalculate"),
  btnExportCSV: $("btnExportCSV"), // now used as Export PDF
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

// Split minutes into normal/loading for a single-day segment [start..end) within 0..1440
function splitByLoading(startMin, endMin, loadingStartMin) {
  if (endMin <= loadingStartMin) return { normal: endMin - startMin, loading: 0 };
  if (startMin >= loadingStartMin) return { normal: 0, loading: endMin - startMin };
  return { normal: loadingStartMin - startMin, loading: endMin - loadingStartMin };
}

// -------- day helpers ----------
function normDayName(v) {
  return String(v || "").trim().toLowerCase();
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
  if (!el.toast) return;
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 1100);
}

function setStatus(text) {
  if (!el.pillStatus) return;
  el.pillStatus.textContent = text;
}

// ---------- UI render ----------
function render() {
  if (el.weekLabel) el.weekLabel.value = state.weekLabel || "";
  if (el.baseRate) el.baseRate.value = String(state.baseRate);

  // keep stable if still present
  if (el.loadH) el.loadH.value = String(state.loadH);
  if (el.loadM) el.loadM.value = String(state.loadM);
  if (el.loadAP) el.loadAP.value = state.loadAP;

  if (el.chipBase) el.chipBase.textContent = String(state.baseRate);

  if (!el.shiftList) return;
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

    <div style="margin-top:12px">
      <button class="btn btnPrimary" type="button" data-action="addShift">+ Add Shift</button>
    </div>
  `;

  // input handling
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

  // click handling: remove shift / add shift
  wrap.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("button[data-action='remove']");
    if (removeBtn) {
      const i = Number(wrap.dataset.index);
      state.shifts.splice(i, 1);
      if (state.shifts.length === 0) state.shifts.push(structuredClone(DEFAULTS.shifts[0]));
      saveState();
      render();
      setStatus("Shift removed");
      return;
    }

    const addBtn = e.target.closest("button[data-action='addShift']");
    if (addBtn) {
      state.shifts.push(structuredClone(DEFAULTS.shifts[0]));
      saveState();
      render();
      setStatus("Shift added");
      return;
    }
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
  const baseRateUI = Math.max(0, Number(el.baseRate?.value || DEFAULTS.baseRate));

  const loadStart = toMinutes12(FIXED_LOAD_START.h, FIXED_LOAD_START.m, FIXED_LOAD_START.ap);
  if (loadStart === null) {
    setStatus("Fix loading time");
    return { ok:false, err:"Invalid fixed loading start time" };
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

    const effectiveBaseRate =
      (String(s.didDM || "").toLowerCase() === "yes") ? DM_BASE_RATE : baseRateUI;

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

    const shiftLoadingRate = effectiveBaseRate * (1 + loadingPct);
    totalNormalPay += (normalM / 60) * effectiveBaseRate;
    totalLoadingPay += (loadingM / 60) * shiftLoadingRate;

    perShift.push({
      name: s.name || `Shift ${i+1}`,
      normalMins: normalM,
      loadingMins: loadingM,
      totalMins: normalM + loadingM,
      breakMin
    });
  }

  const normalPay = totalNormalPay;
  const loadingPay = totalLoadingPay;
  const totalPay = normalPay + loadingPay;

  return {
    ok:true,
    baseRate: baseRateUI,
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
    if (el.sumTotalPay) el.sumTotalPay.textContent = "$0.00";
    if (el.sumSubtitle) el.sumSubtitle.textContent = out.err || "Fix inputs and try again.";
    return;
  }

  setStatus("Calculated");
  if (el.sumTotalPay) el.sumTotalPay.textContent = money(out.totalPay);

  const label = (el.weekLabel?.value || "").trim();
  const labelText = label ? `Week: ${label} • ` : "";
  if (el.sumSubtitle) {
    el.sumSubtitle.textContent = `${labelText}${state.shifts.length} shift(s)`;
  }

  if (el.sumTotalHours) el.sumTotalHours.textContent = fmtHM(out.totalMins);
  if (el.sumNormalHours) el.sumNormalHours.textContent = fmtHM(out.normalMins);
  if (el.sumLoadingHours) el.sumLoadingHours.textContent = fmtHM(out.loadingMins);

  if (el.sumBaseRate) el.sumBaseRate.textContent = `${money(out.baseRate)}/hr`;

  if (el.sumLoadingRate) {
    el.sumLoadingRate.innerHTML =
      `<span style="opacity:.75;font-size:.9em;font-weight:400;">Loading starts from 6:30 PM on Weekdays</span>`;
  }
}

// ---------- events ----------
function wire() {
  el.weekLabel?.addEventListener("input", () => {
    state.weekLabel = el.weekLabel.value;
    saveState();
  });

  el.baseRate?.addEventListener("input", () => {
    state.baseRate = Number(el.baseRate.value || DEFAULTS.baseRate);
    if (el.chipBase) el.chipBase.textContent = String(state.baseRate);
    saveState();
  });

  // (Optional) old loading inputs, only if present
  const onLoadTime = () => {
    state.loadH = Number((el.loadH?.value) || DEFAULTS.loadH);
    state.loadM = Number((el.loadM?.value) || DEFAULTS.loadM);
    state.loadAP = (el.loadAP?.value) || DEFAULTS.loadAP;
    saveState();
  };
  el.loadH?.addEventListener("input", onLoadTime);
  el.loadM?.addEventListener("input", onLoadTime);
  el.loadAP?.addEventListener("change", onLoadTime);

  // If you still have a top add button, wire it safely
  if (el.btnAddShift) {
    el.btnAddShift.addEventListener("click", () => {
      state.shifts.push(structuredClone(DEFAULTS.shifts[0]));
      saveState();
      render();
      setStatus("Shift added");
    });
  }

  el.btnCalculate?.addEventListener("click", () => {
    state.weekLabel = el.weekLabel?.value || "";
    state.baseRate = Number(el.baseRate?.value || DEFAULTS.baseRate);

    // force fixed loading time into state
    state.loadH = FIXED_LOAD_START.h;
    state.loadM = FIXED_LOAD_START.m;
    state.loadAP = FIXED_LOAD_START.ap;

    saveState();

    const out = calculateTotals();
    updateSummary(out);
  });

  // Export PDF (button id is still btnExportCSV in your HTML)
  el.btnExportCSV?.addEventListener("click", () => {
    window.print(); // user chooses "Save as PDF"
    setStatus("Print dialog opened");
  });

  el.btnReset?.addEventListener("click", () => {
    if (!confirm("Reset the entire week? This clears all shifts.")) return;

    state = structuredClone(DEFAULTS);
    state.loadH = FIXED_LOAD_START.h;
    state.loadM = FIXED_LOAD_START.m;
    state.loadAP = FIXED_LOAD_START.ap;

    saveState();
    render();

    updateSummary({
      ok:true,
      baseRate: state.baseRate,
      normalMins:0, loadingMins:0, totalMins:0,
      normalPay:0, loadingPay:0, totalPay:0, perShift:[]
    });

    setStatus("Reset");
  });

  el.btnShowLink?.addEventListener("click", () => {
    const url = `${location.origin}${location.pathname}`.replace(/\/[^/]*$/, "/apple.html");
    alert(url);
  });
}

// ---------- init ----------
function init() {
  // ensure fixed load time always
  state.loadH = FIXED_LOAD_START.h;
  state.loadM = FIXED_LOAD_START.m;
  state.loadAP = FIXED_LOAD_START.ap;

  render();

  updateSummary({
    ok:true,
    baseRate: state.baseRate,
    normalMins:0, loadingMins:0, totalMins:0,
    normalPay:0, loadingPay:0, totalPay:0, perShift:[]
  });

  setStatus("Ready");
  wire();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    });
  }
}

init();