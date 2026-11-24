// Headless Chrome check of the showcase: screenshots (mid-pass and settled,
// light/dark, phone), every incident tab, axe scan, console errors, weight.
// Usage: NODE_PATH=<node_modules with playwright + @axe-core/playwright> node tools/verify.mjs <url> <outdir>
import { createRequire } from "module";
import fs from "fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const url = process.argv[2] || "http://localhost:5241/";
const out = process.argv[3] || "docs/screens";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const problems = [];

async function open(opts) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  p.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return [ctx, p];
}
const toTape = (p) => p.evaluate(() => {
  const t = document.querySelector(".picker");
  scrollTo(0, t.getBoundingClientRect().top + scrollY - 64);
});

for (const scheme of ["light", "dark"]) {
  const [ctx, p] = await open({ viewport: { width: 1280, height: 860 }, colorScheme: scheme, reducedMotion: "no-preference", deviceScaleFactor: 2 });
  let bytes = 0;
  p.on("response", async (r) => { try { bytes += (await r.body()).length; } catch {} });
  await p.goto(url, { waitUntil: "networkidle" });
  await p.screenshot({ path: `${out}/hero-${scheme}.png` });
  await toTape(p);
  await p.getByRole("button", { name: "Replay tape" }).click();
  const pause = p.getByRole("button", { name: "Pause replay" });
  await pause.waitFor();
  await pause.click();
  const playhead = p.locator(".pen");
  const position = await playhead.evaluate(async (node) => {
    const animation = node.getAnimations()[0];
    await animation.ready;
    return animation.currentTime;
  });
  await p.waitForTimeout(120);
  const paused = await playhead.evaluate((node) => node.getAnimations()[0].currentTime);
  if (paused !== position) problems.push("playhead moved while replay was paused");
  await p.getByRole("button", { name: "Resume replay" }).click();
  await p.waitForTimeout(520);
  await p.screenshot({ path: `${out}/pen-mid-${scheme}.png` });
  await p.getByRole("button", { name: "Replay tape" }).waitFor();
  const box = await (await p.$("#tape")).boundingBox();
  await p.mouse.move(box.x + box.width * 0.55, box.y + 40);
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/settled-${scheme}.png` });
  if (scheme === "light") {
    const tabs = await p.$$(".picker button");
    for (const tab of tabs) {
      await tab.click();
      await p.waitForTimeout(210);
      const key = await p.evaluate(() => location.hash.slice(1));
      await p.screenshot({ path: `${out}/incident-${key}.png` });
    }
    const axe = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    for (const v of axe.violations) problems.push(`axe ${v.impact} ${v.id}: ${v.nodes.length} node(s), e.g. ${v.nodes[0].target}`);
    console.log(`page weight ${Math.round(bytes / 1024)} KiB (uncompressed)`);
  }
  await ctx.close();
}
{
  const [ctx, p] = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.goto(new URL("#install", url).href, { waitUntil: "networkidle" });
  if (new URL(p.url()).hash !== "#install") problems.push("install fragment was replaced");
  await p.goto(url, { waitUntil: "networkidle" });
  await p.screenshot({ path: `${out}/phone-hero.png` });
  await toTape(p);
  await p.screenshot({ path: `${out}/phone-tape.png` });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (overflow > 0) problems.push(`phone: horizontal overflow ${overflow}px`);
  await p.goto(new URL("#missing-kmsg", url).href);
  const tab = p.getByRole("tab", { selected: true });
  const panel = p.getByRole("tabpanel");
  if (await panel.getAttribute("aria-labelledby") !== "tab-missing-kmsg") problems.push("incident deep link did not select its panel");
  const before = await p.locator("#readout").innerText();
  await p.getByRole("button", { name: "Next event" }).tap();
  if (await p.locator("#readout").innerText() === before) problems.push("touch event step did not change readout");
  const seek = p.getByRole("slider");
  await seek.press("End");
  if (await seek.inputValue() !== await seek.getAttribute("max")) problems.push("event scrubber did not reach the final event");
  if (!await p.getByRole("button", { name: "Next event" }).isDisabled()) problems.push("last event should disable next");
  await p.locator("#tape").press("Home");
  if (!await p.getByRole("button", { name: "Previous event" }).isDisabled()) problems.push("first event should disable previous");
  await tab.press("ArrowLeft");
  if (new URL(p.url()).hash !== "#kill9") problems.push("keyboard tab selection did not update incident link");
  const hiddenCitation = p.getByRole("link", { name: /in the full report/ }).first();
  await hiddenCitation.click();
  const anchor = new URL(p.url()).hash;
  if (!anchor || await p.locator(anchor).count() !== 1) problems.push("citation for an event outside the tape did not open its report row");
  await ctx.close();
}
{
  const [ctx, p] = await open({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
  await p.goto(url, { waitUntil: "networkidle" });
  await toTape(p);
  await p.waitForTimeout(150);
  const hidden = await p.evaluate(() =>
    [...document.querySelectorAll("#tape-svg .m-bad")].filter((m) => m.getBoundingClientRect().height < 2).length);
  if (hidden) problems.push(`reduced motion: ${hidden} failure marks not visible immediately`);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "no problems found");
process.exitCode = problems.length ? 1 : 0;
