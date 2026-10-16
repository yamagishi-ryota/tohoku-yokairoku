export const SAVE_KEY = "tohoku-yokairoku-v1";
export function createGame(cards, chapters) {
  const ids = cards.map((c) => c.id),
    valid = new Set(ids);
  const fresh = () => ({
    version: 1,
    current: 0,
    reached: 0,
    chapters: chapters.map(() => ({
      attemptCount: 0,
      solved: false,
      selected: [],
    })),
    cards: Object.fromEntries(ids.map((id) => [id, "available"])),
    globalLockUntil: 0,
    se: true,
    bgm: false,
    ending: null,
    endingReached: false,
  });
  const clean = (s) =>
    s.chapters.forEach((ch) => {
      ch.selected = ch.selected.filter((id) => s.cards[id] === "available");
    });
  const locked = (s, now = Date.now()) => now < s.globalLockUntil;
  const canAttempt = (s, now = Date.now()) =>
    !locked(s, now) &&
    !s.chapters[s.current].solved &&
    s.chapters[s.current].selected.length ===
      chapters[s.current].required_count &&
    s.chapters[s.current].selected.every((id) => s.cards[id] === "available");
  function select(s, id) {
    const ch = s.chapters[s.current];
    if (ch.solved || s.cards[id] !== "available") return false;
    const i = ch.selected.indexOf(id);
    if (i >= 0) ch.selected.splice(i, 1);
    else if (ch.selected.length < chapters[s.current].required_count)
      ch.selected.push(id);
    else return false;
    return true;
  }
  function attempt(s, now = Date.now()) {
    if (!canAttempt(s, now)) throw Error("今は解放を試みられません。");
    const ch = s.chapters[s.current];
    ch.attemptCount++;
    const answers = chapters[s.current].answers;
    const success =
      new Set(ch.selected).size === answers.length &&
      answers.every((id) => ch.selected.includes(id));
    if (success) {
      ch.solved = true;
      answers.forEach((id) => (s.cards[id] = "released"));
      clean(s);
    } else s.globalLockUntil = now + 60000;
    return success;
  }
  function canMove(s, target, now = Date.now()) {
    return (
      Number.isInteger(target) &&
      target >= 0 &&
      target < chapters.length &&
      !locked(s, now) &&
      (target <= s.reached ||
        (target === s.reached + 1 &&
          s.current === s.reached &&
          s.chapters[s.current].attemptCount > 0))
    );
  }
  function move(s, target, now = Date.now()) {
    if (!canMove(s, target, now)) return false;
    s.current = target;
    s.reached = Math.max(s.reached, target);
    return true;
  }
  function oracle(s, type, target, cost) {
    if (s.cards[cost] !== "available")
      throw Error("利用可能な代価を1枚選んでください。");
    if (!["card", "group", "discarded"].includes(type))
      throw Error("質問を選んでください。");
    if (type === "card" && (!valid.has(target) || target === cost))
      throw Error("質問対象と代価は別の札を選んでください。");
    const answers = chapters[s.current].answers,
      selection = [...s.chapters[s.current].selected];
    s.cards[cost] = "discarded";
    clean(s);
    if (type === "card") return answers.includes(target) ? "必要" : "不要";
    if (type === "group")
      return String(selection.filter((id) => answers.includes(id)).length);
    return answers.some((id) => s.cards[id] === "discarded") ? "ある" : "ない";
  }
  function recover(s, target, costs) {
    if (
      s.cards[target] !== "discarded" ||
      costs.length !== 2 ||
      new Set(costs).size !== 2 ||
      costs.includes(target) ||
      costs.some((id) => s.cards[id] !== "available")
    )
      throw Error("捨て札1枚と、異なる利用可能な札2枚を選んでください。");
    costs.forEach((id) => (s.cards[id] = "discarded"));
    s.cards[target] = "available";
    clean(s);
  }
  const canEnd = (s, now = Date.now()) =>
    s.current === chapters.length - 1 &&
    s.chapters.at(-1).attemptCount > 0 &&
    !locked(s, now);
  function end(s, now = Date.now()) {
    if (!canEnd(s, now)) throw Error("まだ旅を終えられません。");
    s.ending = s.chapters.every((ch) => ch.solved) ? "complete" : "remaining";
    s.endingReached = true;
    return s.ending;
  }
  function restore(raw) {
    if (!raw) return fresh();
    const s = JSON.parse(raw);
    if (
      s.version !== 1 ||
      !Number.isInteger(s.current) ||
      s.current < 0 ||
      s.current >= chapters.length ||
      !Number.isInteger(s.reached) ||
      s.reached < s.current ||
      s.reached >= chapters.length ||
      !Array.isArray(s.chapters) ||
      s.chapters.length !== chapters.length ||
      !s.cards ||
      Object.keys(s.cards).length !== ids.length ||
      ids.some(
        (id) => !["available", "discarded", "released"].includes(s.cards[id]),
      ) ||
      !Number.isFinite(s.globalLockUntil) ||
      s.globalLockUntil < 0 ||
      typeof s.se !== "boolean" ||
      typeof s.bgm !== "boolean" ||
      ![null, "complete", "remaining"].includes(s.ending) ||
      typeof s.endingReached !== "boolean"
    )
      throw Error("保存データの形式が正しくありません。");
    s.chapters.forEach((ch, i) => {
      if (
        !Number.isInteger(ch.attemptCount) ||
        ch.attemptCount < 0 ||
        typeof ch.solved !== "boolean" ||
        !Array.isArray(ch.selected) ||
        ch.selected.length > chapters[i].required_count ||
        new Set(ch.selected).size !== ch.selected.length ||
        ch.selected.some((id) => !valid.has(id)) ||
        (ch.solved &&
          (ch.attemptCount === 0 ||
            chapters[i].answers.some((id) => s.cards[id] !== "released")))
      )
        throw Error("保存データの章情報が正しくありません。");
    });
    clean(s);
    return s;
  }
  return {
    fresh,
    select,
    attempt,
    canAttempt,
    locked,
    canMove,
    move,
    oracle,
    recover,
    canEnd,
    end,
    restore,
  };
}
