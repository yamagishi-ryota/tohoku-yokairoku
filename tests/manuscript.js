import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { createGame, SAVE_KEY } from "../src/game.js";
const cards = JSON.parse(await readFile("cards.json")),
  chapters = JSON.parse(await readFile("chapters.json")),
  game = createGame(cards, chapters);
const server = spawn(
  "python3",
  ["-m", "http.server", "8768", "--bind", "127.0.0.1"],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8768/")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : existsSync("/usr/bin/chromium")
        ? { executablePath: "/usr/bin/chromium" }
        : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await mkdir("test-results", { recursive: true });
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1366, height: 600 },
    { width: 1280, height: 600 },
    { width: 1024, height: 600 },
    { width: 1024, height: 540 },
  ]) {
    await page.setViewportSize(viewport);
    for (const current of [5, 6]) {
      const state = game.fresh();
      state.current = state.reached = current;
      for (const id of chapters[current].answers) game.select(state, id);
      await page.goto("http://127.0.0.1:8768/");
      await page.evaluate(
        ({ key, state }) => {
          localStorage.setItem(key, JSON.stringify(state));
          sessionStorage.setItem("tohoku-entered", "1");
        },
        { key: SAVE_KEY, state },
      );
      await page.reload();
      await page.waitForSelector(".card");
      await page.evaluate(() => document.fonts.ready);
      assert.deepEqual(
        await page.locator("#lines li").allTextContents(),
        chapters[current].lines,
      );
      const bounds = await page.evaluate(() => {
        const paper = document.querySelector(".paper").getBoundingClientRect(),
          controls = document
            .querySelector(".controls")
            .getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollHeight > innerHeight,
          text: [...document.querySelectorAll("#lines li")].map((li) => {
            const range = document.createRange();
            range.selectNodeContents(li);
            return [...range.getClientRects()].every(
              (r) =>
                r.top >= paper.top &&
                r.bottom <= paper.bottom + 1 &&
                r.right <= paper.right &&
                r.left >= paper.left &&
                r.bottom <= controls.top,
            );
          }),
          buttons: [
            ...document.querySelectorAll(
              "header button,nav button,aside button",
            ),
          ]
            .filter((e) => !e.hidden)
            .every((e) => {
              const r = e.getBoundingClientRect();
              return r.top >= 0 && r.bottom <= innerHeight;
            }),
        };
      });
      assert.equal(
        bounds.scroll,
        false,
        JSON.stringify({ viewport, current, bounds }),
      );
      assert.equal(
        bounds.buttons,
        true,
        JSON.stringify({ viewport, current, bounds }),
      );
      assert.equal(bounds.text.length, chapters[current].lines.length);
      assert.ok(
        bounds.text.every(Boolean),
        JSON.stringify({ viewport, current, bounds }),
      );
      if (current === 6)
        await page.screenshot({
          path: `test-results/full-six-lines-${viewport.width}x${viewport.height}.png`,
        });
    }
    console.log(
      `PASS: complete chapter 6 (4 lines) and final chapter (6 lines), all controls visible without scrolling at ${viewport.width}x${viewport.height}`,
    );
  }
} finally {
  await browser?.close();
  server.kill();
}
