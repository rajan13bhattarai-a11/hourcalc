function toMinutes(h, m, ap) {
  h = Number(h);
  m = Number(m);

  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 1 || h > 12 || m < 0 || m > 59) return null;

  ap = String(ap || "").toUpperCase();
  if (ap === "AM") {
    if (h === 12) h = 0;
  } else if (ap === "PM") {
    if (h !== 12) h += 12;
  } else {
    return null;
  }

  return h * 60 + m;
}

function fmtHM(mins) {
  mins = Math.round(mins);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}

// Split minutes into normal/loading based on loadingStartMin (0..1440)
function splitByLoading(startMin, endMin, loadingStartMin) {
  if (endMin <= loadingStartMin) return { normal: endMin - startMin, loading: 0 };
  if (startMin >= loadingStartMin) return { normal: 0, loading: endMin - startMin };
  return { normal: loadingStartMin - startMin, loading: endMin - loadingStartMin };
}

function calculate() {
  // Start/End
  const s = toMinutes(startH.value, startM.value, startAP.value);
  const e0 = toMinutes(endH.value, endM.value, endAP.value);

  if (s === null || e0 === null) {
    result.innerText = "Invalid time input";
    payBreakdown.innerText = "";
    return;
  }

  let e = e0;
  if (e < s) e += 1440; // next day auto

  // Break
  const breakMin = Math.max(0, Number(document.getElementById("break").value || 0));

  // Loading start time (default 6:30 PM)
  const loadStart = toMinutes(
    document.getElementById("loadH").value,
    document.getElementById("loadM").value,
    document.getElementById("loadAP").value
  );

  if (loadStart === null) {
    result.innerText = "Invalid loading start time";
    payBreakdown.innerText = "";
    return;
  }

  // Rates
  const baseRate = Math.max(0, Number(document.getElementById("baseRate").value || 0));
  const loadingRate = Math.max(0, Number(document.getElementById("loadingRate").value || 0));

  // Total duration minutes (minus break)
  let total = (e - s) - breakMin;
  if (total < 0) total = 0;

  // Split work minutes into normal/loading.
  let normalMins = 0;
  let loadingMins = 0;

  function processSegment(segStart, segEnd, dayOffset) {
    const startInDay = segStart - dayOffset;
    const endInDay = segEnd - dayOffset;
    const split = splitByLoading(startInDay, endInDay, loadStart);
    normalMins += split.normal;
    loadingMins += split.loading;
  }

  if (e <= 1440) {
    // single day
    processSegment(s, e, 0);
  } else {
    // crosses midnight
    processSegment(s, 1440, 0);
    processSegment(1440, e, 1440);
  }

  // Break placement: based on dropdown
  const breakChoice = document.getElementById("breakBeforeLoading").value;

  let normalAfterBreak = normalMins;
  let loadingAfterBreak = loadingMins;

  if (breakChoice === "yes") {
    // Break before loading starts -> remove from normal
    normalAfterBreak = Math.max(0, normalMins - breakMin);
  } else {
    // Break after loading starts -> remove from loading
    loadingAfterBreak = Math.max(0, loadingMins - breakMin);
  }

  // Hours
  const normalHours = normalAfterBreak / 60;
  const loadingHours = loadingAfterBreak / 60;

  // Pay
  const normalPay = normalHours * baseRate;
  const loadingPay = loadingHours * loadingRate;
  const totalPay = normalPay + loadingPay;

  // Output
  result.innerText = `Total: ${fmtHM(total)}`;

  payBreakdown.innerHTML = `
    <div>Normal: <b>${fmtHM(normalAfterBreak)}</b> × ${money(baseRate)}/hr = <b>${money(normalPay)}</b></div>
    <div>Loading: <b>${fmtHM(loadingAfterBreak)}</b> × ${money(loadingRate)}/hr = <b>${money(loadingPay)}</b></div>
    <div style="margin-top:10px;font-size:18px;"><b>Total Pay: ${money(totalPay)}</b></div>
  `;
}

// register service worker (offline)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}
