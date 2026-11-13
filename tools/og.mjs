// Captures site/og.png (1200x630) from the real page: the tape, settled.
// Usage: NODE_PATH=<node_modules with playwright> node tools/og.mjs <url>
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const url = process.argv[2] || "http://localhost:5241/";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const p = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: "light" });
await p.goto(url, { waitUntil: "networkidle" });
await p.evaluate(() => {
  document.querySelector(".top").style.display = "none";
  const t = document.querySelector(".picker");
  scrollTo(0, t.getBoundingClientRect().top + scrollY - 92);
  const tag = document.createElement("div");
  tag.textContent = "hostmortem · a flight recorder for Linux edge boxes";
  tag.style.cssText = "position:fixed;top:30px;left:40px;font:700 32px 'Schibsted Grotesk',sans-serif;letter-spacing:-.02em;color:#1d1b17;z-index:9";
  document.body.append(tag);
});
await p.waitForTimeout(400);
await p.screenshot({ path: "site/og.png" });
await browser.close();
console.log("site/og.png written");
