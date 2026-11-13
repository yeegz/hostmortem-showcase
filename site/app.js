/* Hostmortem showcase: replays real lab incidents on a recorder tape.
   No framework, no HTML strings: every node is built with DOM methods.
   Motion plays once and settles. */
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

  let current = null;
  let ordered = [];
  let sel = -1;
  let x0 = 0, x1 = 1;
  let sweep = 0;

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
    const b = h("button", { type: "button", role: "tab", id: "tab-" + inc.key, "aria-selected": "false", "aria-controls": "tape", tabindex: "-1" }, inc.label);
    b.addEventListener("click", () => select(i, true));
    picker.insertBefore(b, ink);
  });
  const tabs = [...picker.querySelectorAll("button")];
  picker.addEventListener("keydown", (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const map = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 };
    if (e.key in map) { e.preventDefault(); tabs[map[e.key]].focus(); select(map[e.key], true); }
  });
  function moveInk(btn) {
    ink.style.width = btn.offsetWidth + "px";
    ink.style.transform = `translateX(${btn.offsetLeft}px)`;
    btn.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
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
    svg.setAttribute("viewBox", `0 0 ${W} ${hgt}`);
    svg.replaceChildren();
    names.replaceChildren();
    const ns = { "vector-effect": "non-scaling-stroke" };
    LANES.forEach((name, l) => {
      const y = laneY(l, hgt);
      svg.append(svgEl("line", { x1: 0, x2: W, y1: y, y2: y, class: "lane-rule", ...ns }));
      names.append(h("span", { style: `top:${y}px` }, name));
    });
    const w = current.window;
    svg.append(svgEl("rect", { x: xOf(w.open), y: 0, width: Math.max(2, xOf(w.close) - xOf(w.open)), height: hgt, class: "window" }));
    // Labels are HTML so they never stretch with the tape's aspect ratio.
    labels.replaceChildren(h("span", { class: "tape-label", style: `left:${pxOf(w.open) + 6}px;top:6px` }, "incident"));
    for (const s of current.splices) {
      const x = xOf(s.t);
      svg.append(svgEl("line", { x1: x, x2: x, y1: 0, y2: hgt, class: "splice-line", ...ns }));
      labels.append(h("span", { class: "tape-label", style: `left:${pxOf(s.t) + 5}px;bottom:6px` }, s.label));
    }
    // Marks ink in as the pen passes: each one's CSS animation is delayed by
    // its x position, so the browser runs the whole pass on the compositor
    // with no per-frame JavaScript.
    const play = animate && !reduce;
    const DUR = 1400;
    const passAt = (x) => DUR * (1 - Math.cbrt(1 - x / W)); // inverse of the pen's ease-out
    const marks = svgEl("g", {});
    for (const e of ordered) {
      const x = xOf(e.t), y = laneY(e.lane, hgt);
      const half = e.bad ? 11 : e.info ? 8 : 5;
      e.hit = svgEl("line", { x1: x, x2: x, y1: y - 14, y2: y + 14, class: "m-hit", ...ns });
      const m = svgEl("line", { x1: x, x2: x, y1: y - half, y2: y + half, class: (e.bad ? "m-bad" : e.info ? "m-info" : "m-ok") + (play ? " ink" : ""), ...ns });
      if (play) m.style.animationDelay = Math.round(passAt(Math.max(0, Math.min(W, x)))) + "ms";
      marks.append(e.hit, m);
    }
    svg.append(marks);
    ++sweep;
    if (play) {
      const pen = svgEl("line", { x1: 0, x2: 0, y1: 0, y2: hgt, class: "pen", ...ns });
      pen.style.setProperty("--pen-w", W + "px");
      pen.addEventListener("animationend", () => pen.remove(), { once: true });
      svg.append(pen);
    }
    if (sel >= 0) mark(sel, false);
  }

  function nearestByX(px) {
    const b = svgBox();
    const t = x0 + ((px - b.left) / b.width) * (x1 - x0);
    let best = -1, bd = Infinity;
    ordered.forEach((e, i) => {
      const d = Math.abs(e.t - t) * (e.bad ? 0.6 : 1); // failures are easier to land on
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function describe(e) {
    return [
      h("b", null, "#" + e.id), ` · ${fmtT(e.t)}${e.boot > 1 ? " (boot " + e.boot + ")" : ""} · ${LANES[e.lane]}`,
      h("br"), h("b", null, e.kind), `${e.subject ? " [" + e.subject + "]" : ""} ${e.brief}`,
    ];
  }

  function mark(i, announce = true) {
    if (sel >= 0 && ordered[sel] && ordered[sel].hit) ordered[sel].hit.classList.remove("on");
    sel = i;
    const e = ordered[i];
    if (!e) return;
    if (e.hit) e.hit.classList.add("on");
    tape.classList.add("reading");
    cursor.style.transform = `translateX(${pxOf(e.t)}px)`;
    readout.classList.toggle("bad", !!e.bad);
    if (announce) readout.replaceChildren(...describe(e));
  }

  tape.addEventListener("pointermove", (ev) => {
    const r = tape.getBoundingClientRect();
    const i = nearestByX(ev.clientX - r.left);
    if (i !== sel) mark(i);
  });
  tape.addEventListener("pointerleave", () => tape.classList.remove("reading"));
  tape.addEventListener("keydown", (ev) => {
    const k = ev.key;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(k)) return;
    ev.preventDefault();
    let i = sel < 0 ? 0 : sel;
    if (k === "Home") i = 0;
    else if (k === "End") i = ordered.length - 1;
    else {
      const d = k === "ArrowRight" ? 1 : -1;
      do { i += d; } while (ev.shiftKey && ordered[i] && !ordered[i].bad); // Shift skips to failures
      i = Math.max(0, Math.min(ordered.length - 1, i));
    }
    mark(i);
  });
  tape.addEventListener("focus", () => { if (sel < 0) mark(Math.max(0, ordered.findIndex((e) => e.bad))); });

  /* ---------- verdict ---------- */
  const LABEL = { supported: "Supported", possible: "Possible", ruled_out: "Ruled out" };
  function withCites(text) {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(/#(\d+)/g)) {
      out.push(text.slice(last, m.index));
      out.push(h("button", { type: "button", class: "cite", "data-id": m[1], "aria-label": `Show event ${m[1]} on the tape` }, "#" + m[1]));
      last = m.index + m[0].length;
    }
    out.push(text.slice(last));
    return out;
  }

  function renderVerdict() {
    const c = current.conclusion;
    const unknown = c.verdict !== "supported";
    const rows = current.hypotheses.map((hy, i) =>
      h("div", { class: "v-row", style: `animation-delay:${reduce ? 0 : 60 * i}ms;--d:${reduce ? 0 : 60 * i}ms` },
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
  function citeTo(btn, scroll) {
    const id = +btn.dataset.id;
    const i = ordered.findIndex((e) => e.id === id);
    if (i < 0) { readout.textContent = `#${id} is outside the shortened tape on this page.`; return; }
    mark(i);
    if (scroll) {
      const r = tape.getBoundingClientRect();
      if (r.top < 70 || r.bottom > innerHeight) tape.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    }
  }
  verdict.addEventListener("pointerover", (e) => { const b = e.target.closest(".cite"); if (b) citeTo(b, false); });
  verdict.addEventListener("focusin", (e) => { const b = e.target.closest(".cite"); if (b) citeTo(b, false); });
  verdict.addEventListener("click", (e) => { const b = e.target.closest(".cite"); if (b) citeTo(b, true); });

  /* ---------- select ---------- */
  function select(i, animate) {
    current = data.incidents[i];
    tabs.forEach((b, j) => { b.setAttribute("aria-selected", String(j === i)); b.tabIndex = j === i ? 0 : -1; });
    moveInk(tabs[i]);
    ordered = [...current.events].sort((a, b) => a.t - b.t);
    x0 = current.range[0];
    x1 = current.range[1];
    sel = -1;
    tape.classList.remove("reading");
    tape.setAttribute("aria-label", `Recorder tape for ${current.label}: ${ordered.length} events in ${LANES.length} lanes`);
    what.replaceChildren(h("strong", null, "Injected: "), current.injected, " ",
      h("a", { href: current.report, class: "full" }, "Full report"));
    readout.replaceChildren("Move along the tape to read an event.");
    readout.classList.remove("bad");
    draw(animate);
    renderVerdict();
    if (history.replaceState) history.replaceState(null, "", "#" + current.key);
  }
  $("#replay-btn").addEventListener("click", () => draw(true));

  let rt;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { draw(false); moveInk(tabs[data.incidents.indexOf(current)]); }, 80);
  });

  /* ---------- ledger + status ---------- */
  $("#ledger").replaceChildren(...data.measured.map((m) =>
    h("div", null, h("dt", null, m.label), h("dd", null, m.value), m.how ? h("dd", { class: "how" }, h("a", { href: m.how }, "how it was measured")) : null)));
  $("#status-working").replaceChildren(...data.status.working.map((s) => h("li", null, s)));
  $("#status-not").replaceChildren(...data.status.not.map((s) => h("li", null, s)));

  const startAt = Math.max(0, data.incidents.findIndex((x) => "#" + x.key === location.hash));
  select(startAt, false);
  if (!reduce && "IntersectionObserver" in window) {
    // Play the pen once, when the tape is actually on screen.
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { draw(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(tape);
  }
})();
