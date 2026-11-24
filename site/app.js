/* Hostmortem showcase: replays real lab incidents on a recorder tape.
   No framework, no HTML strings: every node is built with DOM methods.
   The tape animates when Replay is pressed. */
// Copy button for the install line (hidden without JS or a clipboard).
(() => {
  for (const b of document.querySelectorAll(".copy-btn")) {
    const src = document.getElementById(b.dataset.copy);
    if (!src || !navigator.clipboard) continue;
    const label = b.querySelector("span");
    let reset;
    b.hidden = false;
    b.addEventListener("click", async () => {
      clearTimeout(reset);
      try {
        await navigator.clipboard.writeText(src.textContent);
        b.dataset.copyState = "copied";
        label.textContent = "Copied";
      } catch {
        delete b.dataset.copyState;
        label.textContent = "Select and copy";
      }
      reset = setTimeout(() => {
        delete b.dataset.copyState;
        label.textContent = "Copy";
      }, 2000);
    });
  }
})();

(() => {
  "use strict";
  const data = window.HM_DATA;
  if (!data) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, root = document) => root.querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const LANES = ["DNS", "Network", "Processes", "Kernel", "Agent"];
  const W = 1000; // tape coordinate width; height follows the element

  const picker = $(".picker");
  const ink = $(".picker-ink");
  const tape = $("#tape");
  const svg = $("#tape-svg");
  const names = $(".lane-names");
  const cursor = $(".cursor");
  const readout = $("#readout");
  const what = $("#tape-what");
  const verdict = $("#verdict");
  const panel = $("#incident-panel");
  const replayButton = $("#replay-btn");
  const replayLabel = $("span", replayButton);
  const eventSeek = $("#event-seek");
  const eventCount = $("#event-count");
  const previous = $("#event-prev");
  const next = $("#event-next");

  let current = null;
  let ordered = [];
  let sel = -1;
  let playback = "idle";
  let x0 = 0, x1 = 1;

  const fmtT = (t) => (t >= 0 ? "+" : "−") + Math.abs(t).toFixed(1) + " s";
  const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  /** h("p", {class:"x"}, "text", childNode, ...) */
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "class") n.className = attrs[k];
      else if (k === "style") n.style.cssText = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  }

  /* ---------- picker (ARIA tabs) ---------- */
  data.incidents.forEach((inc, i) => {
    const b = h("button", { type: "button", role: "tab", id: "tab-" + inc.key, "aria-selected": "false", "aria-controls": panel.id, tabindex: "-1" }, inc.label);
    b.addEventListener("click", () => select(i, { updateUrl: true }));
    picker.insertBefore(b, ink);
  });
  const tabs = [...picker.querySelectorAll("button")];
  picker.addEventListener("keydown", (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const map = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 };
    if (e.key in map) { e.preventDefault(); tabs[map[e.key]].focus({ preventScroll: true }); select(map[e.key], { updateUrl: true }); }
  });
  function moveInk(btn) {
    ink.style.width = btn.offsetWidth + "px";
    ink.style.transform = `translateX(${btn.offsetLeft}px)`;
    const left = btn.offsetLeft;
    const right = left + btn.offsetWidth;
    if (left < picker.scrollLeft) picker.scrollLeft = left - 5;
    if (right > picker.scrollLeft + picker.clientWidth) picker.scrollLeft = right - picker.clientWidth + 5;
  }

  /* ---------- tape ---------- */
  const laneY = (l, hgt) => { const top = 24, bot = hgt - 20; return top + ((bot - top) * (l + 0.5)) / LANES.length; };
  const xOf = (t) => ((t - x0) / (x1 - x0)) * W;
  // SVG elements may report clientWidth 0, so measure with bounding boxes.
  const svgBox = () => { const a = svg.getBoundingClientRect(), b = tape.getBoundingClientRect(); return { left: a.left - b.left, width: a.width }; };
  const pxOf = (t) => { const b = svgBox(); return b.left + (xOf(t) / W) * b.width; };
  const labels = h("div", { class: "tape-labels", "aria-hidden": "true" });
  tape.append(labels);

  function draw(animate) {
    const hgt = tape.clientHeight;
    const axisY = hgt - 24;
    svg.setAttribute("viewBox", `0 0 ${W} ${hgt}`);
    svg.replaceChildren();
    names.replaceChildren();
    const ns = { "vector-effect": "non-scaling-stroke" };

    const pattern = svgEl("pattern", { id: "incident-hatch", width: 7, height: 7, patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(36)" });
    pattern.append(svgEl("rect", { width: 7, height: 7, fill: "#191919" }),
      svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 7, class: "window-stroke", ...ns }));
    const defs = svgEl("defs", {});
    defs.append(pattern);
    const w = current.window;
    svg.append(defs, svgEl("rect", { x: xOf(w.open), y: 0, width: Math.max(2, xOf(w.close) - xOf(w.open)), height: axisY, class: "window" }));

    const left = pxOf(w.open) + 6;
    labels.replaceChildren(h("span", { class: "tape-label", style: `left:${left}px;top:5px` }, "incident"));
    const box = svgBox();
    const roughStep = (x1 - x0) * 64 / box.width;
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((seconds) => seconds >= roughStep) || 900;
    for (let time = Math.ceil(x0 / step) * step; time <= x1; time += step) {
      const x = xOf(time);
      const px = pxOf(time);
      svg.append(svgEl("line", { x1: x, x2: x, y1: 0, y2: axisY + 4, class: "time-tick", ...ns }));
      if (px - box.left >= 10 && px - box.left < box.width - 12) {
        labels.append(h("span", { class: "time-label", style: `left:${px}px` },
          time < 0 ? `−${-time}s` : `${time}s`));
      }
    }
    svg.append(svgEl("line", { x1: 0, x2: W, y1: axisY, y2: axisY, class: "time-axis", ...ns }));
    LANES.forEach((name, l) => {
      const y = laneY(l, hgt);
      svg.append(svgEl("line", { x1: 0, x2: W, y1: y, y2: y, class: "lane-rule", ...ns }));
      names.append(h("span", { style: `top:${y}px` }, name));
    });
    for (const s of current.splices) {
      const x = xOf(s.t);
      svg.append(svgEl("line", { x1: x, x2: x, y1: 0, y2: axisY, class: "splice-line", ...ns }));
      labels.append(h("span", { class: "tape-label", style: `left:${pxOf(s.t) + 5}px;bottom:28px` }, s.label));
    }

    // The playhead and mark delays share the same time scale.
    const play = animate && !reduce;
    const duration = 2400;
    tape.style.setProperty("--replay-duration", `${duration}ms`);
    setPlayback(play ? "playing" : "idle");
    const marks = svgEl("g", {});
    for (const e of ordered) {
      const x = xOf(e.t), y = laneY(e.lane, hgt);
      const half = e.bad ? 11 : e.info ? 8 : 5;
      e.hit = svgEl("line", { x1: x, x2: x, y1: y - 14, y2: y + 14, class: "m-hit", ...ns });
      const m = svgEl("line", { x1: x, x2: x, y1: y - half, y2: y + half, class: (e.bad ? "m-bad" : e.info ? "m-info" : "m-ok") + (play ? " ink" : ""), ...ns });
      if (play) m.style.animationDelay = `${Math.round(duration * Math.max(0, Math.min(1, x / W)))}ms`;
      marks.append(e.hit, m);
    }
    svg.append(marks);
    if (play) {
      const pen = svgEl("g", { class: "pen" });
      pen.style.setProperty("--pen-w", W + "px");
      pen.append(svgEl("line", { x1: 0, x2: 0, y1: 0, y2: axisY, ...ns }),
        svgEl("circle", { cx: 0, cy: axisY, r: 2, fill: "currentColor", ...ns }));
      pen.addEventListener("animationend", () => {
        pen.remove();
        setPlayback("idle");
        mark(ordered.length - 1);
      }, { once: true });
      svg.append(pen);
    }
  }

  function setPlayback(state) {
    playback = state;
    tape.dataset.replay = state;
    replayButton.dataset.replay = state;
    const label = { idle: "Replay tape", playing: "Pause replay", paused: "Resume replay" }[state];
    if (replayLabel.textContent !== label) replayLabel.textContent = label;
  }

  function nearestEvent(px, py) {
    const box = svgBox();
    if (px < box.left || px > box.left + box.width) return -1;
    let best = -1, closest = Infinity;
    const height = tape.clientHeight;
    ordered.forEach((event, i) => {
      const x = box.left + xOf(event.t) / W * box.width;
      const dx = x - px;
      const dy = (laneY(event.lane, height) - py) * 1.45;
      const distance = dx * dx + dy * dy;
      if (distance < closest) { closest = distance; best = i; }
    });
    return best;
  }

  function describe(e) {
    return [
      h("b", null, "#" + e.id), ` · ${fmtT(e.t)}${e.boot > 1 ? " (boot " + e.boot + ")" : ""} · ${LANES[e.lane]}`,
      h("br"), h("b", null, e.kind), `${e.subject ? " [" + e.subject + "]" : ""} ${e.brief}`,
    ];
  }

  function mark(i) {
    if (sel >= 0 && ordered[sel] && ordered[sel].hit) ordered[sel].hit.classList.remove("on");
    sel = i;
    const e = ordered[i];
    if (!e) return;
    if (e.hit) e.hit.classList.add("on");
    tape.classList.add("reading");
    cursor.style.transform = `translateX(${pxOf(e.t)}px)`;
    readout.classList.toggle("bad", !!e.bad);
    readout.replaceChildren(...describe(e));
    eventSeek.value = i + 1;
    eventSeek.style.setProperty("--seek-progress", `${100 * i / Math.max(1, ordered.length - 1)}%`);
    eventSeek.setAttribute("aria-valuetext", `Event ${i + 1} of ${ordered.length}, ${fmtT(e.t)}, ${LANES[e.lane]}`);
    eventCount.textContent = `Event ${i + 1} / ${ordered.length}`;
    previous.disabled = sel === 0;
    next.disabled = sel === ordered.length - 1;
  }

  function seek(index) {
    if (playback !== "idle") draw(false);
    mark(index);
  }

  function pickEvent(ev) {
    const r = tape.getBoundingClientRect();
    const i = nearestEvent(ev.clientX - r.left, ev.clientY - r.top);
    if (i >= 0 && (i !== sel || playback !== "idle")) seek(i);
  }
  tape.addEventListener("pointermove", (ev) => {
    if (ev.pointerType === "mouse" && playback === "idle") pickEvent(ev);
  });
  tape.addEventListener("click", pickEvent);
  eventSeek.addEventListener("input", () => seek(Number(eventSeek.value) - 1));
  previous.addEventListener("click", () => seek(sel - 1));
  next.addEventListener("click", () => seek(sel + 1));
  tape.addEventListener("keydown", (ev) => {
    const k = ev.key;
    if (!ordered.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(k)) return;
    ev.preventDefault();
    let i = sel < 0 ? 0 : sel;
    if (k === "Home") i = 0;
    else if (k === "End") i = ordered.length - 1;
    else {
      const d = k === "ArrowRight" ? 1 : -1;
      do { i += d; } while (ev.shiftKey && ordered[i] && !ordered[i].bad); // Shift skips to failures
      i = Math.max(0, Math.min(ordered.length - 1, i));
    }
    seek(i);
  });

  /* ---------- verdict ---------- */
  const LABEL = { supported: "Supported", possible: "Possible", ruled_out: "Ruled out" };
  function withCites(text) {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(/#(\d+)/g)) {
      out.push(text.slice(last, m.index));
      const id = Number(m[1]);
      const label = "#" + id;
      out.push(ordered.some((event) => event.id === id)
        ? h("button", { type: "button", class: "cite", "data-id": id, "aria-label": `Show event ${id} on the tape` }, label)
        : h("a", { class: "cite", href: `${current.report}#i${current.incidentId}e${id}`, "aria-label": `Read event ${id} in the full report` }, label));
      last = m.index + m[0].length;
    }
    out.push(text.slice(last));
    return out;
  }

  function renderVerdict() {
    const c = current.conclusion;
    const unknown = c.verdict !== "supported";
    const rows = current.hypotheses.map((hy) =>
      h("div", { class: "v-row" },
        h("span", { class: "v-tag " + hy.verdict }, LABEL[hy.verdict]),
        h("div", null,
          h("p", { class: "v-title" }, hy.title, h("small", null, hy.score + " pts")),
          h("p", { class: "v-text" }, withCites(hy.explanation)),
          hy.missing.length ? h("p", { class: "v-missing" }, h("b", null, "Could not check: "), hy.missing.join("; ")) : null)));
    const blind = current.unobservable.length
      ? h("div", { class: "blind" }, h("h3", null, "What it could not see"),
          h("ul", null, current.unobservable.map((u) => h("li", null, h("b", null, u.what), ": " + u.reason))))
      : null;
    verdict.replaceChildren(
      h("p", { class: "v-conclusion" }, "Conclusion: ", h("span", { class: "word" + (unknown ? " unknown" : "") }, unknown ? "unknown" : "supported")),
      h("p", { class: "v-reason" }, c.reason),
      ...rows, blind || "");
  }
  verdict.addEventListener("click", (event) => {
    const button = event.target.closest("button.cite");
    if (!button) return;
    const index = ordered.findIndex((item) => item.id === Number(button.dataset.id));
    if (index < 0) return;
    seek(index);
    tape.focus({ preventScroll: true });
    tape.scrollIntoView({ block: "center", behavior: reduce ? "instant" : "smooth" });
  });

  /* ---------- select ---------- */
  function select(i, { updateUrl = false } = {}) {
    current = data.incidents[i];
    tabs.forEach((b, j) => { b.setAttribute("aria-selected", String(j === i)); b.tabIndex = j === i ? 0 : -1; });
    panel.setAttribute("aria-labelledby", tabs[i].id);
    moveInk(tabs[i]);
    ordered = [...current.events].sort((a, b) => a.t - b.t);
    eventSeek.max = Math.max(1, ordered.length);
    eventSeek.disabled = ordered.length < 2;
    x0 = current.range[0];
    x1 = current.range[1];
    sel = -1;
    tape.setAttribute("aria-label", `Recorder tape for ${current.label}: ${ordered.length} events in ${LANES.length} lanes`);
    const file = svgEl("svg", { class: "control-icon", viewBox: "0 0 20 20", "aria-hidden": "true" });
    file.append(svgEl("path", { d: "M5 3h6l4 4v10H5zM11 3v4h4M8 11h4m-4 3h4" }));
    what.replaceChildren(h("strong", null, current.label), " ", current.injected, " ",
      h("a", { href: current.report, class: "full" }, file, "Full report"));
    redraw(false);
    renderVerdict();
    if (updateUrl) history.replaceState(null, "", "#" + current.key);
  }
  function redraw(animate) {
    draw(animate);
    if (ordered.length) {
      mark(sel < 0 ? Math.max(0, ordered.findIndex((e) => e.bad)) : sel);
    } else {
      previous.disabled = next.disabled = true;
      readout.textContent = "No events in this recording.";
    }
  }
  replayButton.addEventListener("click", () => {
    if (playback !== "idle") {
      setPlayback(playback === "playing" ? "paused" : "playing");
      return;
    }
    sel = ordered.length ? 0 : -1;
    redraw(true);
  });

  let rt;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { redraw(false); moveInk(tabs[data.incidents.indexOf(current)]); }, 80);
  });

  /* ---------- ledger + status ---------- */
  $("#ledger").replaceChildren(...data.measured.map((m) =>
    h("div", null, h("dt", null, m.label), h("dd", null, m.value), m.how ? h("dd", { class: "how" }, h("a", { href: m.how }, "how it was measured")) : null)));
  $("#status-working").replaceChildren(...data.status.working.map((s) => h("li", null, s)));
  $("#status-not").replaceChildren(...data.status.not.map((s) => h("li", null, s)));

  function incidentFromHash() {
    return data.incidents.findIndex((x) => "#" + x.key === location.hash);
  }
  function openLinkedIncident() {
    const index = incidentFromHash();
    if (index < 0) return;
    select(index);
    $("#examples").scrollIntoView({ behavior: "instant" });
  }
  select(Math.max(0, incidentFromHash()));
  if (incidentFromHash() >= 0) $("#examples").scrollIntoView({ behavior: "instant" });
  addEventListener("hashchange", openLinkedIncident);
})();
