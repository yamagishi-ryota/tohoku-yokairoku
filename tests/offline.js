import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
const url = "https://offline-handout.test/tohoku-yokairoku.html";
const html = await readFile("dist-offline/tohoku-yokairoku.html", "utf8");
const chapters = JSON.parse(await readFile("chapters.json"));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : existsSync("/usr/bin/chromium")
      ? { executablePath: "/usr/bin/chromium" }
      : {}),
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    offline: true,
  });
  await context.route(url, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: html }),
  );
  const page = await context.newPage(),
    requests = [],
    errors = [];
  page.on("request", (r) => {
    if (!r.isNavigationRequest() && !r.url().startsWith("data:"))
      requests.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.locator("#begin").click();
  await page.waitForSelector(".card");
  assert.equal(await page.locator(".card").count(), 54);
  assert.equal(
    await page.locator("#oracle").textContent(),
    "神のおつげ（ヒント）",
  );
  await page.evaluate(() =>
    Promise.all([...document.images].map((img) => img.decode())),
  );
  await page
    .getByRole("button", { name: "白神山地を拡大", exact: true })
    .click();
  await page.locator("dialog img").evaluate((img) => img.decode());
  await page.locator("#close").click();
  await page.clock.install();
  await page.locator('[data-id="S_2"] .choose').click();
  assert.equal(
    await page
      .locator('[data-id="S_2"]')
      .evaluate((card) => getComputedStyle(card).outlineWidth),
    "6px",
  );
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/classroom-gold-selection.png" });
  await page.locator("#attempt").click();
  await page.locator("#close").click();
  assert.equal(await page.locator("#next").isDisabled(), true);
  await page.reload();
  await page.waitForSelector(".card");
  assert.equal(
    await page.locator('[data-id="S_2"] .choose').getAttribute("aria-pressed"),
    "true",
  );
  await page.clock.fastForward(15001);
  await page.locator('[data-id="S_2"] .choose').click();
  // Pay for an oracle and decode the shrine illustration with the machine offline.
  await page.locator("#oracle").click();
  let selects = page.locator("dialog select");
  assert.deepEqual(await selects.nth(0).locator("option").allTextContents(), [
    "選んでください",
    " 選びし札を問う（必要か不要か）",
    " 選びし組（何枚合っているか）",
    " 捨てし札（捨てていないか）",
  ]);
  await selects.nth(0).selectOption("card");
  await selects.nth(1).selectOption("S_A");
  await selects.nth(2).selectOption("S_3");
  await page.getByRole("button", { name: "確認へ", exact: true }).click();
  await page.getByRole("button", { name: "実行する", exact: true }).click();
  assert.equal(await page.locator(".oracle-answer").textContent(), "必要");
  await page.locator(".oracle-vision img").evaluate((img) => img.decode());
  await page.locator("#close").click();
  // Reset, then release every chapter and inspect the individual artwork and ending.
  await page.locator("#reset").click();
  await page.getByRole("button", { name: "実行する", exact: true }).click();
  for (let i = 0; i < 7; i++) {
    assert.deepEqual(
      await page.locator("#lines li").allTextContents(),
      chapters[i].lines,
    );
    for (const id of chapters[i].answers)
      await page.locator(`[data-id="${id}"] .choose`).click();
    await page.locator("#attempt").click();
    assert.ok(
      (
        await page
          .locator(".yokai-art")
          .evaluate((e) => e.style.backgroundImage)
      ).includes("data:image/webp;base64,"),
    );
    await page.locator("#close").click();
  }
  await page.locator("#gallery").click();
  assert.equal(await page.locator(".gallery-grid button").count(), 7);
  await page
    .locator(".gallery-grid img")
    .evaluateAll((images) => Promise.all(images.map((i) => i.decode())));
  await page.locator("#close").click();
  await page.locator("#end").click();
  await page.locator(".ending-art").evaluate((img) => img.decode());
  assert.match(
    await page.locator(".complete-ending").textContent(),
    /あなたは東北の語り部となったのだ/,
  );
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/offline-ending.png" });
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: self-contained handout works with the browser offline; 54 cards, save/reload, 15s lock, paid shrine oracle, seven releases, gallery and storyteller image; zero external requests",
  );
  // A school browser may deny storage for local files: keep play available and report unsaved progress.
  const limited = await browser.newContext({ offline: true });
  await limited.addInitScript(() => {
    for (const name of ["localStorage", "sessionStorage"])
      Object.defineProperty(window, name, {
        get() {
          throw new DOMException("Unavailable", "SecurityError");
        },
      });
  });
  await limited.route(url, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: html }),
  );
  const fallback = await limited.newPage();
  await fallback.goto(url);
  await fallback.locator("#begin").click();
  assert.equal(await fallback.locator("#attempt").isDisabled(), true);
  await fallback.locator('[data-id="S_A"] .choose').click();
  assert.equal(await fallback.locator("#attempt").isDisabled(), false);
  assert.match(
    await fallback.locator("#save-status").textContent(),
    /保存できません/,
  );
  await fallback.locator("#attempt").click();
  assert.equal(await fallback.locator(".ritual.released").count(), 1);
  await limited.close();
  console.log(
    "PASS: denied local-file storage permits play with a visible no-save notice",
  );
  await context.close();
} finally {
  await browser.close();
}
