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
  ["-m", "http.server", "8767", "--bind", "127.0.0.1"],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8767/")).ok) break;
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
  await page.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    window.AudioContext = class extends NativeAudio {
      constructor(...args) {
        super(...args);
        const analyser = this.createAnalyser(),
          destination = this.destination,
          create = this.createGain.bind(this);
        this.createGain = () => {
          const gain = create(),
            connect = gain.connect.bind(gain);
          gain.connect = (target, ...rest) => {
            if (target === destination) connect(analyser);
            return connect(target, ...rest);
          };
          return gain;
        };
        window.__testAudio = { context: this, analyser };
      }
    };
  });
  await page.goto("http://127.0.0.1:8767/");
  await page.waitForSelector("#begin");
  await page.evaluate(() => document.fonts.ready);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/start-page.png" });
  assert.equal(await page.locator("#intro").isVisible(), true);
  assert.match(await page.locator("#intro").textContent(), /54枚/);
  await page.locator("#begin").click();
  assert.equal(await page.locator("#intro").isVisible(), false);
  console.log("PASS: purpose/start page leads to game");
  await page.locator("#sound-test").click();
  await page.waitForTimeout(160);
  const audio = await page.evaluate(() => {
    const { context, analyser } = window.__testAudio;
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    return { state: context.state, signal: samples.some((x) => x !== 128) };
  });
  assert.equal(audio.state, "running");
  assert.equal(audio.signal, true);
  console.log("PASS: user-initiated audio runs and emits a nonzero waveform");
  // Compare both attempts: shared animation, illustration, concealment and lock retained.
  await page.locator('[data-id="S_2"] .choose').click();
  await page.locator("#attempt").click();
  assert.equal(await page.locator(".ritual.concealed .yokai-art").count(), 1);
  const failureAnimation = await page
    .locator(".yokai-art")
    .evaluate((e) => getComputedStyle(e).animationName);
  assert.match(
    await page.locator(".yokai-art").getAttribute("aria-label"),
    /隠された/,
  );
  await page.screenshot({ path: "test-results/failure-illustration.png" });
  await page.locator("#close").click();
  assert.equal(await page.locator("#next").isDisabled(), true);
  await page.locator("#reset").click();
  await page.getByRole("button", { name: "実行する", exact: true }).click();
  await page.locator('[data-id="S_A"] .choose').click();
  await page.locator("#attempt").click();
  assert.equal(await page.locator(".ritual.released .yokai-art").count(), 1);
  assert.equal(
    await page
      .locator(".yokai-art")
      .evaluate((e) => getComputedStyle(e).animationName),
    failureAnimation,
  );
  await page.waitForTimeout(1900);
  await page.screenshot({ path: "test-results/success-illustration.png" });
  await page.locator("#close").click();
  console.log(
    "PASS: success and failure share animation; success reveals art, failure conceals it",
  );
  // Inject coherent late-game state to exercise worst-case six-line layout and all controls.
  const state = game.fresh();
  state.current = state.reached = 6;
  game.oracle(state, "card", "S_A", "S_2");
  game.oracle(state, "card", "C_8", "S_3");
  for (const id of chapters[6].answers) game.select(state, id);
  game.oracle(state, "group", null, "S_4");
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key: SAVE_KEY, state },
  );
  await page.reload();
  await page.waitForSelector(".card");
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.locator('[data-id="C_8"] .certainty').textContent(),
    "✓ 確定",
  );
  assert.equal(
    await page.locator('[data-id="S_A"] .certainty').textContent(),
    "不要",
  );
  assert.match(
    await page.locator("#oracle-summary").textContent(),
    /6枚が一致/,
  );
  await page.locator("#oracle-history").click();
  assert.match(
    await page.locator("#modal-content").textContent(),
    /質問した札：.*奇跡の一本松/,
  );
  await page.locator("#close").click();
  // Change selection: history must retain original snapshot, never act as a free live hint.
  await page.locator('[data-id="C_8"] .choose').click();
  assert.match(
    await page.locator("#oracle-summary").textContent(),
    /6枚が一致/,
  );
  const layout = await page.evaluate(() => ({
    body: document.documentElement.scrollHeight <= innerHeight,
    aside:
      document.querySelector("aside").scrollHeight <=
      document.querySelector("aside").clientHeight + 1,
    buttons: [
      ...document.querySelectorAll("header button,nav button,aside button"),
    ]
      .filter((e) => !e.hidden)
      .every((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.top >= 0 &&
          r.bottom <= innerHeight &&
          r.left >= 0 &&
          r.right <= innerWidth
        );
      }),
    lines: [...document.querySelectorAll("#lines li")].every(
      (e) => e.getBoundingClientRect().height < 40,
    ),
  }));
  assert.deepEqual(layout, {
    body: true,
    aside: true,
    buttons: true,
    lines: true,
  });
  await page.screenshot({ path: "test-results/compact-final-chapter.png" });
  for (const height of [640, 600]) {
    await page.setViewportSize({ width: 1366, height });
    const bounds = await page.evaluate(() => ({
      aside:
        document.querySelector("aside").scrollHeight <=
        document.querySelector("aside").clientHeight + 1,
      buttons: [
        ...document.querySelectorAll("header button,nav button,aside button"),
      ]
        .filter((e) => !e.hidden)
        .every((e) => e.getBoundingClientRect().bottom <= innerHeight),
    }));
    assert.deepEqual(
      bounds,
      { aside: true, buttons: true },
      `viewport 1366x${height}`,
    );
  }
  console.log(
    "PASS: chapter-specific paid markings and historical group snapshot persist; every control fits without scrolling, final-chapter lines remain single-line at 1366x768",
  );
  assert.equal(
    await page
      .locator("#lines")
      .evaluate((e) =>
        getComputedStyle(e).fontFamily.includes("YokairokuBrush"),
      ),
    true,
  );
  // Verify the illustration is actually decoded, not just a placeholder background.
  assert.equal(
    await page.evaluate(async () => {
      const img = new Image();
      img.src = "assets/yokai/portraits/ch1.png";
      await img.decode();
      return img.naturalWidth > 0;
    }),
    true,
  );
  const cropIds = cards
    .filter((card) => card.sheet === 6)
    .map((card) => card.id);
  const crops = await page.evaluate(async (ids) => {
    return Promise.all(
      ids.map(async (id) => {
        const image = new Image();
        image.src = `assets/cards/${id}.png`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        let white = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 240 && pixels[i + 1] > 240 && pixels[i + 2] > 240)
            white++;
        }
        return { id, whiteRatio: white / (canvas.width * canvas.height) };
      }),
    );
  }, cropIds);
  crops.forEach((crop) =>
    assert.ok(
      crop.whiteRatio < 0.01,
      `${crop.id} includes unwanted white sheet margin`,
    ),
  );
  console.log("PASS: all nine sheet-6 crops exclude the white canvas margin");
  await page.setViewportSize({ width: 1366, height: 768 });
  const positions = await page
    .locator(".card")
    .evaluateAll((elements) =>
      elements.map((e) => [e.dataset.id, e.offsetLeft, e.offsetTop]),
    );
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    state.cards.S_A = "released";
    state.chapters[0].solved = true;
    state.chapters[0].attemptCount = 1;
    localStorage.setItem(key, JSON.stringify(state));
  }, SAVE_KEY);
  await page.reload();
  await page.waitForSelector(".card");
  for (const id of ["S_A", "S_2"]) {
    const card = page.locator(`[data-id="${id}"]`);
    assert.equal(await card.locator(".choose").isDisabled(), true);
    const appearance = await card.evaluate((element) => {
      const name = element.querySelector(".name"),
        choose = element.querySelector(".choose");
      const bounds = name.getBoundingClientRect(),
        cardBounds = element.getBoundingClientRect();
      return {
        nameFilter: getComputedStyle(name).filter,
        buttonFilter: getComputedStyle(choose).filter,
        imageFilter: getComputedStyle(element.querySelector("img")).filter,
        nameColor: getComputedStyle(name).color,
        opacity: getComputedStyle(choose).opacity,
        contained:
          bounds.top >= cardBounds.top && bounds.bottom <= cardBounds.bottom,
      };
    });
    assert.equal(appearance.nameFilter, "none");
    assert.equal(appearance.buttonFilter, "none");
    assert.notEqual(appearance.imageFilter, "none");
    assert.equal(appearance.nameColor, "rgb(23, 27, 20)");
    assert.equal(appearance.opacity, "1");
    assert.equal(appearance.contained, true);
  }
  assert.deepEqual(
    await page
      .locator(".card")
      .evaluateAll((elements) =>
        elements.map((e) => [e.dataset.id, e.offsetLeft, e.offsetTop]),
      ),
    positions,
  );
  await page.screenshot({ path: "test-results/card-names-and-crops.png" });
  console.log(
    "PASS: released and discarded names keep high contrast, image brightness is preserved, and all 54 positions stay fixed",
  );
  const labels = await page.locator(".card").evaluateAll((elements) =>
    elements.map((element) => {
      const label = element.querySelector(".name"),
        image = element.querySelector("img");
      const nameBounds = label.getBoundingClientRect(),
        imageBounds = image.getBoundingClientRect();
      return {
        id: element.dataset.id,
        outsideDisabledButton: label.closest("button") === null,
        legible:
          getComputedStyle(label).fontSize === "11px" &&
          label.scrollHeight <= label.clientHeight,
        separated: imageBounds.bottom <= nameBounds.top + 1,
        imageBrightnessUnchanged:
          !getComputedStyle(image).filter.includes("brightness"),
      };
    }),
  );
  for (const label of labels) {
    assert.equal(label.outsideDisabledButton, true, label.id);
    assert.equal(label.legible, true, label.id);
    assert.equal(label.separated, true, label.id);
    assert.equal(label.imageBrightnessUnchanged, true, label.id);
  }
  console.log(
    "PASS: all 54 names use independent high-contrast labels; fixed image frames do not overlap names or apply darkening",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.kill();
}
