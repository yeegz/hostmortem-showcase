// Captures portfolio media from the live showcase (real lab data) as PNGs;
// tools/portfolio-media.sh converts them to WebP size variants.
// Usage: NODE_PATH=<node_modules with playwright> node tools/portfolio-media.mjs <url> <outdir>
import { createRequire } from "module";
import fs from "fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const url = process.argv[2] || "https://yousofselim.com/hostmortem-showcase/";
const out = process.argv[3] || "/tmp/hm-media";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });

async function shot(name, hash, { w, h, dpr, scheme = "light", top = 0, extra } = {}) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, colorScheme: scheme, reducedMotion: "reduce" });
  await p.goto(url + hash, { waitUntil: "networkidle" });
  await p.evaluate((top) => {
    document.querySelector(".top").style.display = "none";
    const t = document.querySelector(".picker");
    scrollTo(0, t.getBoundingClientRect().top + scrollY - top);
  }, top);
  if (extra) await extra(p);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${name}.png` });
  await p.close();
}
const hover = (frac) => async (p) => {
  const b = await (await p.$("#tape")).boundingBox();
  await p.mouse.move(b.x + b.width * frac, b.y + 40);
};

// Homepage card, 1600x1000: the tape and the start of the verdict.
await shot("card", "#dns-upstream", { w: 1280, h: 800, dpr: 1.25, top: 24, extra: hover(0.5) });
// Case-study screens, 2880x1920.
await shot("replay", "#dns-upstream", { w: 1440, h: 960, dpr: 2, top: 24, extra: hover(0.5) });
await shot("unknown", "#missing-kmsg", { w: 1440, h: 960, dpr: 2, top: 24 });
await shot("crash", "#agent-crash", { w: 1440, h: 960, dpr: 2, top: 24, extra: hover(0.52) });
await shot("dark", "#link-down", { w: 1440, h: 960, dpr: 2, scheme: "dark", top: 24, extra: hover(0.3) });
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, colorScheme: "light" });
  await p.goto(url + "reports/kill9.html", { waitUntil: "networkidle" });
  await p.screenshot({ path: `${out}/report.png` });
  await p.close();
}
// App icon from the showcase favicon.
{
  const p = await browser.newPage({ viewport: { width: 192, height: 192 } });
  await p.goto(url + "reports/");
  await p.setContent(`<body style="margin:0;background:transparent"><img src="${url}favicon.svg" width="192" height="192"></body>`);
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/icon.png`, omitBackground: true });
  await p.close();
}
await browser.close();
console.log("captured to", out);
