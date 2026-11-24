// Capture real showcase and CLI output for the portfolio.
// Usage: NODE_PATH=<playwright modules> node tools/portfolio-media.mjs <showcase-url> <outdir> [report-url]
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const url = new URL(process.argv[2] || "http://127.0.0.1:5241/");
const out = process.argv[3] || "/tmp/hm-media";
const report = process.argv[4] || new URL("reports/dns_upstream.html", url).href;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });

async function shot(name, { path = "", target, width = 1440, height = 900, scale = 2, section, offset = 82, transparent = false } = {}) {
  const page = await browser.newPage({
    viewport: { width, height }, deviceScaleFactor: scale,
    reducedMotion: "reduce", colorScheme: "dark",
  });
  try {
    await page.goto(target || new URL(path, url).href);
    await page.evaluate(() => document.fonts.ready);
    if (section) {
      await page.locator(section).evaluate((element, top) => {
        window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - top);
      }, offset);
    }
    await page.screenshot({ path: `${out}/${name}.png`, omitBackground: transparent });
  } finally {
    await page.close();
  }
}

try {
  await shot("install");
  await shot("phone", { width: 390, height: 844, scale: 3 });
  await shot("card", { path: "#dns-upstream", section: ".picker", width: 1280, height: 800, scale: 1.25 });
  await shot("replay", { path: "#dns-upstream", section: ".picker" });
  await shot("unknown", { path: "#missing-kmsg", section: ".picker" });
  await shot("how", { section: "#how-title", offset: 102 });
  await shot("measured", { section: "#measured-title", offset: 102 });
  await shot("report", { target: report });
  await shot("icon", { path: "brand/icon.svg", width: 512, height: 512, scale: 1, transparent: true });
} finally {
  await browser.close();
}
console.log("Captured showcase, report and icon in " + out);
