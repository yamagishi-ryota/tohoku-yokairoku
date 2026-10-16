import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGame } from "../src/game.js";
const cards = JSON.parse(
    readFileSync(new URL("../cards.json", import.meta.url)),
  ),
  chapters = JSON.parse(
    readFileSync(new URL("../chapters.json", import.meta.url)),
  ),
  g = createGame(cards, chapters);
const pick = (s, ids) =>
  ids.forEach((id) => assert.equal(g.select(s, id), true));
test("54 unique IDs, standard deck, six complete sheets and 21 distinct answers", () => {
  assert.equal(cards.length, 54);
  assert.equal(new Set(cards.map((c) => c.id)).size, 54);
  for (const suit of ["S", "H", "D", "C"])
    assert.equal(cards.filter((c) => c.suit === suit).length, 13);
  assert.equal(cards.filter((c) => c.suit === "JOKER").length, 2);
  for (let i = 1; i <= 6; i++)
    assert.deepEqual(
      cards.filter((c) => c.sheet === i).map((c) => c.sheet_position),
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
  assert.deepEqual(
    chapters.map((c) => c.required_count),
    [1, 2, 2, 3, 3, 4, 6],
  );
  chapters.forEach((c) => {
    assert.equal(c.lines.length, c.required_count);
    assert.equal(c.answers.length, c.required_count);
    assert.ok(c.answers.every((id) => cards.some((c) => c.id === id)));
  });
  assert.equal(new Set(chapters.flatMap((c) => c.answers)).size, 21);
});
test("first chapter accepts only S_A; every other single card fails with no partial result", () => {
  for (const c of cards) {
    const s = g.fresh();
    pick(s, [c.id]);
    assert.equal(g.attempt(s, 100), c.id === "S_A");
    assert.equal(s.chapters[0].attemptCount, 1);
    if (c.id !== "S_A") {
      assert.deepEqual(s.chapters[0].selected, [c.id]);
      assert.equal(s.globalLockUntil, 60100);
    }
  }
});
test("fourth chapter exact set is order independent; wrong set fails", () => {
  for (const ids of [
    ["S_7", "S_4", "S_6"],
    ["S_6", "S_7", "S_4"],
    ["S_4", "S_6", "S_7"],
  ]) {
    const s = g.fresh();
    s.current = s.reached = 3;
    pick(s, ids);
    assert.equal(g.attempt(s, 0), true);
  }
  const s = g.fresh();
  s.current = s.reached = 3;
  pick(s, ["S_4", "S_6", "S_8"]);
  assert.equal(g.attempt(s, 0), false);
});
test("selection cannot exceed count, under-count cannot attempt; solved cards cannot be used again", () => {
  const s = g.fresh();
  assert.equal(g.canAttempt(s), false);
  assert.throws(() => g.attempt(s));
  pick(s, ["S_A"]);
  assert.equal(g.select(s, "S_2"), false);
  assert.equal(g.attempt(s), true);
  assert.equal(s.cards.S_A, "released");
  assert.equal(g.select(s, "S_A"), false);
  assert.equal(g.canAttempt(s), false);
  assert.deepEqual(s.chapters[0].selected, []);
});
test("60s global lock persists and gates all movement including backward; selection can change", () => {
  let s = g.fresh();
  pick(s, ["S_2"]);
  g.attempt(s, 1000);
  assert.equal(g.move(s, 1, 60999), false);
  assert.equal(g.canAttempt(s, 60999), false);
  s = g.restore(JSON.stringify(s));
  assert.equal(s.globalLockUntil, 61000);
  assert.deepEqual(s.chapters[0].selected, ["S_2"]);
  assert.equal(g.select(s, "S_2"), true);
  pick(s, ["S_A"]);
  assert.equal(g.move(s, 1, 61000), true);
  assert.equal(g.move(s, 0, 61000), true);
  assert.equal(g.move(s, 2, 61000), false);
  assert.deepEqual(s.chapters[0].selected, ["S_A"]);
  g.move(s, 1, 61000);
  pick(s, ["S_4", "S_5"]);
  g.attempt(s, 61000);
  assert.equal(g.move(s, 0, 61001), false);
  assert.equal(g.move(s, 0, 121000), true);
});
test("all oracle types charge one card and follow snapshots and post-payment discard rules", () => {
  const s = g.fresh();
  assert.equal(g.oracle(s, "card", "S_A", "S_2"), "必要");
  assert.equal(s.cards.S_2, "discarded");
  assert.equal(g.oracle(s, "card", "S_3", "S_4"), "不要");
  pick(s, ["S_A"]);
  assert.equal(g.oracle(s, "group", null, "S_A"), "1");
  assert.deepEqual(s.chapters[0].selected, []);
  assert.equal(g.oracle(s, "discarded", null, "S_5"), "ある");
  const t = g.fresh();
  assert.equal(g.oracle(t, "discarded", null, "S_2"), "ない");
  assert.equal(g.oracle(t, "discarded", null, "S_A"), "ある");
  const before = JSON.stringify(t);
  assert.throws(() => g.oracle(t, "card", "S_3", "S_3"));
  assert.throws(() => g.oracle(t, "unknown", null, "S_3"));
  assert.equal(JSON.stringify(t), before);
});
test("cross-chapter selections are cleaned on discard and release", () => {
  const s = g.fresh();
  s.chapters[1].selected = ["S_A", "S_2"];
  pick(s, ["S_A"]);
  g.attempt(s);
  assert.deepEqual(s.chapters[1].selected, ["S_2"]);
  g.oracle(s, "group", null, "S_2");
  assert.deepEqual(s.chapters[1].selected, []);
});
test("recovery exchanges two available cards for one discard atomically and rejects released/duplicate costs", () => {
  const s = g.fresh();
  g.oracle(s, "group", null, "S_2");
  s.chapters[1].selected = ["S_3", "S_4"];
  g.recover(s, "S_2", ["S_3", "S_4"]);
  assert.equal(s.cards.S_2, "available");
  assert.equal(s.cards.S_3, "discarded");
  assert.equal(s.cards.S_4, "discarded");
  assert.deepEqual(s.chapters[1].selected, []);
  const before = JSON.stringify(s);
  assert.throws(() => g.recover(s, "S_3", ["S_2", "S_2"]));
  assert.equal(JSON.stringify(s), before);
  pick(s, ["S_A"]);
  g.attempt(s);
  assert.throws(() => g.recover(s, "S_A", ["S_5", "S_6"]));
  assert.throws(() => g.recover(s, "S_3", ["S_A", "S_6"]));
  g.recover(s, "S_3", ["S_5", "S_6"]);
  assert.equal(s.cards.S_3, "available");
});
test("all solved ending and mixed ending; final failed attempt requires full timeout; no automatic end", () => {
  const s = g.fresh();
  assert.throws(() => g.end(s, 0));
  for (let i = 0; i < 7; i++) {
    pick(s, chapters[i].answers.toReversed());
    assert.equal(g.attempt(s, 0), true);
    if (i < 6) assert.equal(g.move(s, i + 1, 0), true);
  }
  assert.equal(s.ending, null);
  assert.equal(g.end(s, 0), "complete");
  const t = g.fresh();
  for (let i = 0; i < 7; i++) {
    pick(
      t,
      cards.slice(1, 1 + chapters[i].required_count).map((c) => c.id),
    );
    g.attempt(t, i * 60000);
    if (i < 6) assert.equal(g.move(t, i + 1, (i + 1) * 60000), true);
  }
  assert.equal(g.canEnd(t, 419999), false);
  assert.equal(t.ending, null);
  assert.equal(g.end(t, 420000), "remaining");
  assert.equal(t.endingReached, true);
  assert.equal(g.restore(JSON.stringify(t)).ending, "remaining");
});
test("save roundtrip preserves chapter choices, attempts, card states and audio settings; corrupt data rejected", () => {
  const s = g.fresh();
  g.oracle(s, "group", null, "S_2");
  pick(s, ["S_A"]);
  g.attempt(s, 0);
  g.move(s, 1, 0);
  pick(s, ["S_3"]);
  s.se = false;
  s.bgm = true;
  assert.deepEqual(g.restore(JSON.stringify(s)), s);
  assert.throws(() => g.restore("{broken"));
  const bad = structuredClone(s);
  bad.cards.S_A = "invalid";
  assert.throws(() => g.restore(JSON.stringify(bad)));
});

test("paid hints persist per chapter without revealing unpaid information", () => {
  const s = g.fresh();
  assert.deepEqual(s.chapters[0].oracleNotes, []);
  g.oracle(s, "card", "S_A", "S_2");
  pick(s, ["S_A"]);
  g.oracle(s, "group", null, "S_3");
  assert.deepEqual(s.chapters[0].oracleNotes, [
    { type: "card", target: "S_A", selection: [], answer: "必要" },
    { type: "group", target: null, selection: ["S_A"], answer: "1" },
  ]);
  g.select(s, "S_A");
  assert.deepEqual(s.chapters[0].oracleNotes[1].selection, ["S_A"]);
  assert.equal(s.chapters[1].oracleNotes.length, 0);
  assert.deepEqual(
    g.restore(JSON.stringify(s)).chapters[0].oracleNotes,
    s.chapters[0].oracleNotes,
  );
  const legacy = g.fresh();
  legacy.chapters.forEach((ch) => delete ch.oracleNotes);
  assert.deepEqual(
    g.restore(JSON.stringify(legacy)).chapters[0].oracleNotes,
    [],
  );
});
