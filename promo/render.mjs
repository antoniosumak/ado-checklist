// 60fps, 4 subframes per frame spread over a 180° shutter; ffmpeg tmix blends them.
import { chromium } from "playwright-core";
import { pathToFileURL } from "url";
import { mkdirSync } from "fs";
const FPS = 60, SUB = 4, FRAMES = 32 * FPS, WORKERS = 4;
mkdirSync("frames", { recursive: true });
const b = await chromium.launch({ channel: "msedge" });
const total = FRAMES * SUB;
let done = 0;
await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
  const p = await b.newPage({ viewport: { width: 1440, height: 1440 } });
  p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.goto(pathToFileURL("promo.html").href);
  await p.waitForFunction(() => window.ready);
  for (let i = w; i < total; i += WORKERS) {
    const f = Math.floor(i / SUB), s = i % SUB;
    const t = f / FPS + ((s - (SUB - 1) / 2) / SUB) * (0.5 / FPS);
    await p.evaluate((t) => seek(t), t);
    await p.screenshot({ path: `frames/${String(i).padStart(5, "0")}.png` });
    if (++done % 400 === 0) console.log(done, "/", total);
  }
}));
await b.close();
