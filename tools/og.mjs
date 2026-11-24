// Capture the share image from the actual replay, using real lab evidence.
// Usage: NODE_PATH=<playwright modules> node tools/og.mjs [showcase-url]
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const url = new URL(process.argv[2] || "http://127.0.0.1:5241/");
url.hash = "dns-upstream";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto(url.href);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".tape-wrap").evaluate((element) => {
    window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 87);
  });
  await page.screenshot({ path: "site/og.png" });
} finally {
  await browser.close();
}
