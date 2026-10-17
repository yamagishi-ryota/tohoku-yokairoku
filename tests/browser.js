import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
const chapters = JSON.parse(await readFile("chapters.json")),
  cards = JSON.parse(await readFile("cards.json"));
const server = spawn(
  "python3",
  ["-m", "http.server", "8765", "--bind", "127.0.0.1"],
  { stdio: "ignore" },
);
let browser;
let checks = 0;
const pass = (label) => {
  checks++;
  console.log(`PASS ${label}`);
};
try {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch("http://127.0.0.1:8765/");
      if (r.ok) break;
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
  await page.goto("http://127.0.0.1:8765/");
  await page.waitForSelector(".card", { state: "attached" });
  if (await page.locator("#intro").isVisible())
    await page.locator("#begin").click();
  await page.evaluate(() =>
    Promise.all([...document.images].map((i) => i.decode())),
  );
  assert.equal(await page.locator(".card").count(), 54);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
    true,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const positions = await page
    .locator(".card")
    .evaluateAll((es) =>
      es.map((e) => ({ id: e.dataset.id, x: e.offsetLeft, y: e.offsetTop })),
    );
  assert.equal(await page.locator("#attempt").isDisabled(), true);
  await page
    .getByRole("button", { name: "白神山地を拡大", exact: true })
    .click();
  assert.equal(await page.locator("dialog img").count(), 1);
  await page.locator("#close").click();
  assert.equal(await page.locator(".selected").count(), 0);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/chromebook.png",
    fullPage: true,
  });
  pass(
    "1366x768: 54 cards visible, no page overflow, zoom independent of selection, images loaded",
  );
  const choose = (id) => page.locator(`[data-id="${id}"] .choose`).click();
  await page.clock.install({ time: new Date("2026-10-16T00:00:00Z") });
  await choose("S_2");
  await page.locator("#attempt").click();
  assert.equal(await page.locator(".ritual.concealed").count(), 1);
  await page.locator("#close").click();
  assert.equal(
    await page.locator("#message").textContent(),
    "解放できなかった……",
  );
  assert.equal(await page.locator("#next").isDisabled(), true);
  assert.equal(await page.locator("#attempt").isDisabled(), true);
  assert.equal(
    await page.locator('[data-id="S_2"] .choose').getAttribute("aria-pressed"),
    "true",
  );
  await page.reload();
  await page.waitForSelector(".card", { state: "attached" });
  assert.equal(await page.locator("#next").isDisabled(), true);
  assert.equal(
    await page.locator('[data-id="S_2"] .choose').getAttribute("aria-pressed"),
    "true",
  );
  await page.clock.fastForward(60001);
  assert.equal(await page.locator("#next").isDisabled(), false);
  await page.locator("#next").click();
  assert.match(await page.locator("#heading").textContent(), /第二/);
  await page.locator("#prev").click();
  assert.equal(
    await page.locator('[data-id="S_2"] .choose').getAttribute("aria-pressed"),
    "true",
  );
  pass(
    "failed selection and 60-second lock survive reload; unsolved progression and return",
  );
  await choose("S_2");
  await choose("S_A");
  await page.locator("#attempt").click();
  assert.equal(await page.locator("#message").textContent(), "封印解放");
  await page.locator("#close").click();
  assert.equal(
    await page.locator('[data-id="S_A"] .choose').isDisabled(),
    true,
  );
  await page.locator("#next").click();
  await choose("S_3");
  await choose("H_2");
  assert.equal(
    await page.locator('[data-id="S_4"] .choose').isDisabled(),
    true,
  );
  await page.locator("#oracle").click();
  let selects = page.locator("dialog select");
  await selects.nth(0).selectOption("group");
  await selects.nth(2).selectOption("S_3");
  await page.getByRole("button", { name: "確認へ", exact: true }).click();
  await page.getByRole("button", { name: "実行する", exact: true }).click();
  assert.equal(await page.locator("#modal-content p").textContent(), "2");
  await page.locator("#close").click();
  assert.equal(
    await page.locator('[data-id="S_3"] .badge').textContent(),
    "× 捨て札",
  );
  assert.equal(
    await page.locator('[data-id="H_2"] .choose').getAttribute("aria-pressed"),
    "true",
  );
  pass(
    "paid oracle uses pre-payment selection snapshot, clears discarded choice, retains other choice",
  );
  await page.locator("#recover").click();
  selects = page.locator("dialog select");
  await selects.nth(0).selectOption("S_3");
  await selects.nth(1).selectOption("S_4");
  await selects.nth(2).selectOption("S_5");
  await page.getByRole("button", { name: "確認へ", exact: true }).click();
  await page.getByRole("button", { name: "実行する", exact: true }).click();
  await page.locator("#close").click();
  assert.equal(
    await page.locator('[data-id="S_3"] .choose').isDisabled(),
    false,
  );
  assert.equal(
    await page.locator('[data-id="S_4"] .choose').isDisabled(),
    true,
  );
  await page.reload();
  await page.waitForSelector(".card", { state: "attached" });
  assert.equal(
    await page.locator('[data-id="S_4"] .badge').textContent(),
    "× 捨て札",
  );
  assert.equal(
    await page.locator('[data-id="S_A"] .badge').textContent(),
    "◆ 解放済み",
  );
  assert.equal(
    await page.locator('[data-id="H_2"] .choose').getAttribute("aria-pressed"),
    "true",
  );
  pass("two-for-one recovery and full progress persist across reload");
  await page.locator("#reset").click();
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  assert.match(await page.locator("#heading").textContent(), /第二/);
  await page.locator("#reset").click();
  await page.getByRole("button", { name: "実行する", exact: true }).click();
  assert.match(await page.locator("#heading").textContent(), /第一/);
  pass("reset requires explicit confirmation");
  const regions = [
    "青森県",
    "岩手県",
    "秋田県",
    "宮城県",
    "山形県",
    "福島県",
    "東北六県",
  ];
  // Finish every chapter through real UI and verify exact source text and stable card coordinates.
  for (let i = 0; i < 7; i++) {
    assert.equal(await page.locator(".region-tag").textContent(), regions[i]);
    assert.deepEqual(
      await page.locator(".chapter-region").allTextContents(),
      regions,
    );
    assert.deepEqual(
      await page.locator("#lines li").allTextContents(),
      chapters[i].lines,
    );
    for (const id of chapters[i].answers.toReversed()) await choose(id);
    await page.locator("#attempt").click();
    assert.equal(
      await page.locator(".yokai-art").getAttribute("aria-label"),
      `${chapters[i].yokai}のイラスト`,
    );
    const source = await page
      .locator(".yokai-art")
      .evaluate((element) => getComputedStyle(element).backgroundImage);
    assert.ok(source.includes(`portraits/${chapters[i].id}.png`));
    const portrait = await page.locator(".ritual").boundingBox();
    assert.ok(
      portrait.height > portrait.width,
      "yokai artwork uses a portrait frame",
    );
    const closeButton = await page.locator("#close").boundingBox();
    assert.ok(
      closeButton.y + closeButton.height <= 768,
      "portrait and close button fit the viewport",
    );
    if (i === 6) {
      await page.waitForTimeout(1900);
      await page.screenshot({ path: "test-results/reference-aramitama.png" });
    }
    await page.locator("#close").click();
    if (i < 6) await page.locator("#next").click();
  }
  assert.deepEqual(
    await page
      .locator(".card")
      .evaluateAll((es) =>
        es.map((e) => ({ id: e.dataset.id, x: e.offsetLeft, y: e.offsetTop })),
      ),
    positions,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
    true,
  );
  await page.screenshot({
    path: "test-results/final-chapter.png",
    fullPage: true,
  });
  await page.locator("#end").click();
  assert.equal(await page.locator(".storyteller").textContent(), "語り部");
  await page.reload();
  await page.waitForSelector(".storyteller");
  await page.getByRole("button", { name: "書に戻る", exact: true }).click();
  assert.match(await page.locator("#heading").textContent(), /最終章/);
  pass(
    "all seven exact texts and answers, stable card positions, final chapter fits, complete ending persists and returns",
  );
  // New browser storage, all chapters attempted incorrectly and skipped after timeout.
  await page.locator("#reset").click();
  await page.getByRole("button", { name: "実行する", exact: true }).click();
  for (let i = 0; i < 7; i++) {
    for (const c of cards.slice(1, 1 + chapters[i].required_count))
      await choose(c.id);
    await page.locator("#attempt").click();
    await page.locator("#close").click();
    assert.equal(
      await page.locator("#message").textContent(),
      "解放できなかった……",
    );
    await page.clock.fastForward(60001);
    if (i < 6) await page.locator("#next").click();
  }
  assert.equal(await page.locator("dialog").isVisible(), false);
  await page.locator("#end").click();
  assert.equal(await page.locator(".storyteller").count(), 0);
  assert.equal(await page.locator(".shadow").count(), 7);
  await page.getByRole("button", { name: "書に戻る", exact: true }).click();
  pass(
    "all-unsolved ending waits, ends only on request, retains shadows, allows return",
  );
  // Initial resources loaded: core interactions must work with network disabled.
  await page.context().setOffline(true);
  await page.locator("#prev").click();
  await page
    .getByRole("button", { name: "白神山地を拡大", exact: true })
    .click();
  await page.locator("#close").click();
  await page.context().setOffline(false);
  pass("post-load interaction works offline");
  await page.setViewportSize({ width: 768, height: 1024 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  pass("tablet and small-screen layout has no horizontal overflow");
  const fallback = await browser.newPage({
    viewport: { width: 1366, height: 768 },
  });
  fallback.on("pageerror", (e) => errors.push(e.message));
  await fallback.route(/\/assets\/cards\/[^/]+\.png(?:\?.*)?$/, (route) =>
    route.abort(),
  );
  await fallback.goto("http://127.0.0.1:8765/");
  await fallback.waitForSelector(".card", { state: "attached" });
  if (await fallback.locator("#intro").isVisible())
    await fallback.locator("#begin").click();
  await fallback
    .getByRole("button", { name: "白神山地を拡大", exact: true })
    .click();
  assert.equal(
    await fallback.locator("#modal-content p").textContent(),
    cards[0].description,
  );
  await fallback.locator("#close").click();
  await fallback.locator('[data-id="S_A"] .choose').click();
  await fallback.locator("#attempt").click();
  assert.equal(await fallback.locator("#message").textContent(), "封印解放");
  await fallback.locator("#close").click();
  await fallback.locator("#se").click();
  await fallback.locator("#bgm").click();
  await fallback.reload();
  await fallback.waitForSelector(".card", { state: "attached" });
  assert.equal(await fallback.locator("#se").textContent(), "効果音 OFF");
  assert.equal(await fallback.locator("#bgm").textContent(), "環境音 ON");
  pass(
    "missing card images retain names, descriptions and gameplay; audio preferences persist",
  );
  await fallback.evaluate(() =>
    localStorage.setItem("tohoku-yokairoku-v1", "broken-save"),
  );
  await fallback.reload();
  await fallback.waitForSelector("#modal[open]");
  await fallback.locator("#close").click();
  assert.equal(await fallback.locator("#attempt").isDisabled(), true);
  assert.equal(await fallback.locator("#se").isDisabled(), true);
  assert.equal(
    await fallback.evaluate(() => localStorage.getItem("tohoku-yokairoku-v1")),
    "broken-save",
  );
  await fallback.locator("#reset").click();
  await fallback.getByRole("button", { name: "実行する", exact: true }).click();
  assert.equal(
    await fallback.locator('[data-id="S_A"] .choose').isDisabled(),
    false,
  );
  pass("corrupt saves are preserved until confirmed reset");
  await fallback.close();
  assert.deepEqual(errors, []);
  console.log(`${checks} browser checks passed; no page errors.`);
} finally {
  await browser?.close();
  server.kill();
}
