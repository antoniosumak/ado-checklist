import { chromium } from "playwright-core";
import { pathToFileURL } from "url";
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: 1440, height: 1440 } });
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto(pathToFileURL("promo.html").href);
await p.waitForFunction(() => window.ready);
// periodic check: evaluate the raw timeline just past the loop end vs its start
const snap = async (t) => { await p.evaluate((t) => seek(t), t); return p.screenshot(); };
const a = await snap(0), c = await snap(32 - 1e-6), d = await snap(1 / 60), e = await snap(16 - 1 / 60);
console.log("t0 == t32-:", Buffer.compare(a, c) === 0);
console.log(JSON.stringify(await p.evaluate(() => ({ n: EVENTS.length, first: EVENTS.slice(0, 3) }))));
await b.close();
