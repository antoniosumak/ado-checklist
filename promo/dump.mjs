import { chromium } from "playwright-core";
import { pathToFileURL } from "url";
import { writeFileSync } from "fs";
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage();
await p.goto(pathToFileURL("promo.html").href);
await p.waitForFunction(() => window.ready);
writeFileSync("events.json", JSON.stringify(await p.evaluate(() => EVENTS)));
await b.close();
