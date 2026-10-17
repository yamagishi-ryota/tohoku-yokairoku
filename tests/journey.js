import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { createGame, SAVE_KEY } from "../src/game.js";
const cards = JSON.parse(await readFile("cards.json")),
  chapters = JSON.parse(await readFile("chapters.json")),
  game = createGame(cards, chapters);
const server = spawn(
  "python3",
  ["-m", "http.server", "8769", "--bind", "127.0.0.1"],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8769/")).ok) break;
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
  const page = await browser.newPage({
      viewport: { width: 1366, height: 768 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8769/");
  await page.locator("#begin").click();
  await page.locator("#volume").fill("0");
  assert.equal(await page.locator("#volume-value").textContent(), "0%");
  await page.reload();
  await page.waitForSelector(".card");
  assert.equal(await page.locator("#volume").inputValue(), "0");
  await page.locator("#volume").fill("40");
  assert.equal(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).volume,
      SAVE_KEY,
    ),
    0.4,
  );
  assert.equal(await page.locator("#gallery").isDisabled(), true);
  await page.clock.install();
  await page.locator('[data-id="S_A"] .choose').click();
  await page.locator("#attempt").click();
  assert.match(await page.locator("#heading").textContent(), /第一/);
  await page.clock.fastForward(4001);
  assert.match(await page.locator("#heading").textContent(), /第二/);
  assert.equal(await page.locator("#modal").isVisible(), false);
  console.log("PASS: saved volume slider and timed automatic progression");
  await page.locator("#gallery").click();
  assert.equal(await page.locator(".gallery-grid button").count(), 1);
  await page.locator(".gallery-grid button").click();
  assert.equal(
    await page.locator(".gallery-portrait").getAttribute("alt"),
    "鬼",
  );
  await page.locator("#close").click();
  assert.match(await page.locator("#heading").textContent(), /第二/);
  await page.reload();
  await page.waitForSelector(".card");
  await page.locator("#gallery").click();
  assert.equal(await page.locator(".gallery-grid button").count(), 1);
  await page.locator("#close").click();
  console.log(
    "PASS: only released yokai can be reviewed; gallery survives reload and does not change chapters",
  );
  await page.locator("#oracle").click();
  const selects = page.locator("dialog select");
  await selects.nth(0).selectOption("card");
  await selects.nth(1).selectOption("S_3");
  await selects.nth(2).selectOption("S_2");
  await page.getByRole("button", { name: "確認へ", exact: true }).click();
  await page.getByRole("button", { name: "実行する", exact: true }).click();
  assert.equal(await page.locator(".oracle-answer").textContent(), "必要");
  await page.locator(".oracle-vision img").evaluate((img) => img.decode());
  await mkdir("test-results", { recursive: true });
  await page.clock.fastForward(1500);
  await page.screenshot({ path: "test-results/oracle-ceremony.png" });
  await page.locator("#close").click();
  assert.equal(
    await page
      .locator("#oracle-summary")
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 15),
    true,
  );
  console.log(
    "PASS: paid oracle reveals the same answer using imagery and animated light",
  );
  const state = game.fresh();
  for (let i = 0; i < chapters.length; i++) {
    state.current = state.reached = i;
    for (const id of chapters[i].answers) game.select(state, id);
    game.attempt(state);
  }
  game.end(state);
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key: SAVE_KEY, state },
  );
  await page.reload();
  await page.waitForSelector(".complete-ending");
  assert.match(
    await page.locator(".complete-ending").textContent(),
    /東北の地に眠る全ての妖怪が解放された。あなたは東北の語り部となったのだ。/,
  );
  await page.locator(".ending-art").evaluate((img) => img.decode());
  await page.screenshot({ path: "test-results/storyteller-ending.png" });
  await page.getByRole("button", { name: "書に戻る", exact: true }).click();
  await page.locator("#gallery").click();
  assert.equal(await page.locator(".gallery-grid button").count(), 7);
  await page
    .locator(".gallery-grid button")
    .filter({ hasText: "花嫁幽霊" })
    .click();
  await page.locator(".gallery-portrait").evaluate((img) => img.decode());
  await page.screenshot({ path: "test-results/restored-bride.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: storyteller image and exact complete-ending text; all seven portraits including restored bride are accessible",
  );
} finally {
  await browser?.close();
  server.kill();
}
