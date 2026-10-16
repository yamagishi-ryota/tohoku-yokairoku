import { createGame, SAVE_KEY } from "./game.js";
const $ = (id) => document.getElementById(id);
const node = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
async function load(path) {
  const r = await fetch(new URL(path, document.baseURI));
  if (!r.ok) throw Error(`${path} を読み込めません。`);
  return r.json();
}
try {
  const [cards, chapters] = await Promise.all([
    load("cards.json"),
    load("chapters.json"),
  ]);
  const game = createGame(cards, chapters),
    byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  let state,
    blocked = false,
    message = "",
    audio,
    ambient = [];
  try {
    state = game.restore(localStorage.getItem(SAVE_KEY));
  } catch {
    state = game.fresh();
    blocked = true;
  }
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      $("save-status").textContent = "";
      return true;
    } catch {
      $("save-status").textContent =
        "保存できません。この画面を閉じると進行が失われます。";
      return false;
    }
  }
  function context() {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume();
    return audio;
  }
  function sound(success) {
    if (!state.se) return;
    try {
      const ctx = context();
      [110, 165, 220, 330].forEach((f, i) => {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain(),
          t = ctx.currentTime + i * 0.15;
        osc.type = "sine";
        osc.frequency.value = success ? f : f * 0.65;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 2);
      });
    } catch {}
  }
  function ambience() {
    ambient.forEach((o) => o.stop());
    ambient = [];
    if (!state.bgm) return;
    try {
      const ctx = context();
      [55, 82.4].forEach((f) => {
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.frequency.value = f;
        g.gain.value = 0.018;
        o.connect(g).connect(ctx.destination);
        o.start();
        ambient.push(o);
      });
    } catch {}
  }
  const modal = $("modal"),
    content = $("modal-content");
  let lastFocus;
  function open(title) {
    if (!modal.open) lastFocus = document.activeElement;
    const heading = node("h2", title);
    heading.id = "modal-title";
    heading.tabIndex = -1;
    content.replaceChildren(heading);
    if (!modal.open) modal.showModal();
    heading.focus();
    return content;
  }
  function close() {
    modal.close();
    lastFocus?.focus();
  }
  $("close").onclick = close;
  modal.addEventListener("close", () => lastFocus?.focus());
  const btn = (text, fn) => {
    const b = node("button", text);
    b.type = "button";
    b.onclick = fn;
    return b;
  };
  function confirmAction(text, fn) {
    const body = open("確認");
    body.append(
      node("p", text),
      btn("実行する", () => {
        try {
          fn();
        } catch (e) {
          body.append(node("p", e.message));
        }
      }),
      btn("戻る", close),
    );
  }
  function zoom(id) {
    const c = byId[id],
      body = open(`${c.display_rank}　${c.name}`),
      img = node("img", undefined, "enlarged");
    img.src = c.image;
    img.alt = c.name;
    img.onerror = () => img.remove();
    body.append(img, node("p", c.description));
  }
  function sync() {
    $("se").disabled = blocked;
    $("bgm").disabled = blocked;
    const ch = state.chapters[state.current],
      chapter = chapters[state.current];
    $("attempt").disabled = blocked || !game.canAttempt(state);
    $("prev").disabled = blocked || !game.canMove(state, state.current - 1);
    $("next").disabled = blocked || !game.canMove(state, state.current + 1);
    $("end").hidden = state.current !== chapters.length - 1;
    $("end").disabled = blocked || !game.canEnd(state);
    $("lock").textContent = game.locked(state)
      ? `再挑戦・章移動まで ${Math.ceil((state.globalLockUntil - Date.now()) / 1000)} 秒`
      : "";
    [...$("chapters").children].forEach(
      (b, i) => (b.disabled = blocked || !game.canMove(state, i)),
    );
    $("selection").textContent = ch.solved
      ? "この書は解放済み"
      : `選択中 ${ch.selected.length} / ${chapter.required_count} 枚`;
    $("oracle").disabled =
      blocked || !cards.some((c) => state.cards[c.id] === "available");
    $("recover").disabled =
      blocked ||
      cards.filter((c) => state.cards[c.id] === "available").length < 2 ||
      !cards.some((c) => state.cards[c.id] === "discarded");
  }
  const cardElements = new Map();
  cards.forEach((c) => {
    const wrap = node("article", undefined, "card");
    wrap.dataset.id = c.id;
    const choose = btn("", () => {
      if (!blocked && game.select(state, c.id)) {
        save();
        render();
      }
    });
    choose.className = "choose";
    choose.setAttribute("aria-label", `${c.display_rank} ${c.name}を選択`);
    const img = node("img");
    img.src = c.image;
    img.alt = "";
    img.onerror = () => (img.hidden = true);
    choose.append(img, node("span", c.name, "name"));
    const rank = node("span", c.display_rank, "rank"),
      enlarge = btn("＋", () => zoom(c.id));
    enlarge.className = "zoom";
    enlarge.setAttribute("aria-label", `${c.name}を拡大`);
    const badge = node("span", "", "badge");
    wrap.append(choose, rank, enlarge, badge);
    $("deck").append(wrap);
    cardElements.set(c.id, { wrap, choose, badge });
  });
  function render() {
    const chapter = chapters[state.current],
      ch = state.chapters[state.current];
    $("chapters").replaceChildren(
      ...chapters.map((c, i) => {
        const status = state.chapters[i].solved
          ? "解放済み"
          : state.chapters[i].attemptCount
            ? "挑戦済み未解放"
            : i <= state.reached
              ? "到達・未挑戦"
              : "未訪問";
        const b = btn("", () => {
          if (game.move(state, i)) {
            message = "";
            save();
            render();
          }
        });
        b.append(node("span", c.heading), node("small", status));
        b.classList.toggle("active", i === state.current);
        if (i === state.current) b.setAttribute("aria-current", "step");
        return b;
      }),
    );
    $("heading").textContent = `${chapter.heading} ／ ${chapter.yokai}`;
    $("heading")
      .closest(".paper")
      .classList.toggle("long", chapter.lines.length >= 4);
    document.querySelector("aside").scrollTop = 0;
    $("lines").replaceChildren(
      ...chapter.lines.map((line) => node("li", line)),
    );
    $("selected-names").textContent =
      ch.selected.map((id) => byId[id].name).join("・") ||
      (ch.solved ? "札は解放に使われました" : "札を選んでください");
    $("message").textContent = message;
    cards.forEach((c) => {
      const { wrap, choose, badge } = cardElements.get(c.id),
        status = state.cards[c.id],
        selected = ch.selected.includes(c.id);
      wrap.classList.toggle("selected", selected);
      wrap.classList.toggle("unavailable", status !== "available");
      choose.disabled =
        blocked ||
        ch.solved ||
        status !== "available" ||
        (!selected && ch.selected.length >= chapter.required_count);
      choose.setAttribute("aria-pressed", String(selected));
      badge.hidden = status === "available";
      badge.textContent = status === "released" ? "◆ 解放済み" : "× 捨て札";
    });
    $("se").textContent = `効果音 ${state.se ? "ON" : "OFF"}`;
    $("bgm").textContent = `環境音 ${state.bgm ? "ON" : "OFF"}`;
    sync();
  }
  $("attempt").onclick = () => {
    try {
      const success = game.attempt(state);
      message = success ? "封印解放" : "解放できなかった……";
      save();
      render();
      sound(success);
      if (success) {
        const body = open("封印解放"),
          ritual = node("div", undefined, "ritual");
        ritual.append(node("div", "封印解放", "seal"));
        body.append(ritual, node("p", "書を包む気配が、静かにほどけていく。"));
      }
    } catch (e) {
      message = e.message;
      render();
    }
  };
  $("prev").onclick = () => navigate(-1);
  $("next").onclick = () => navigate(1);
  function navigate(delta) {
    if (game.move(state, state.current + delta)) {
      message = "";
      save();
      render();
    }
  }
  function selectField(body, label, list) {
    const holder = node("label", label),
      select = node("select");
    select.append(new Option("選んでください", ""));
    list.forEach((c) =>
      select.append(new Option(`${c.display_rank} ${c.name}`, c.id)),
    );
    holder.append(select);
    body.append(holder);
    return select;
  }
  $("oracle").onclick = () => {
    const body = open("神のお告げ");
    body.append(node("p", "質問ひとつにつき、利用可能な札を1枚奉納します。"));
    const type = selectField(body, "質問の種類", [
      { id: "card", display_rank: "", name: "選びし札を問う" },
      { id: "group", display_rank: "", name: "選びし組を問う" },
      { id: "discarded", display_rank: "", name: "捨てし札を問う" },
    ]);
    const target = selectField(body, "質問対象の札", cards),
      cost = selectField(
        body,
        "奉納する札",
        cards.filter((c) => state.cards[c.id] === "available"),
      );
    const label = target.parentElement;
    label.hidden = true;
    type.onchange = () => (label.hidden = type.value !== "card");
    const error = node("p");
    body.append(
      error,
      btn("確認へ", () => {
        if (
          !type.value ||
          !cost.value ||
          (type.value === "card" &&
            (!target.value || target.value === cost.value))
        ) {
          error.textContent =
            "質問と代価を選んでください。質問対象と代価は別の札です。";
          return;
        }
        const t = type.value,
          id = target.value,
          payment = cost.value;
        confirmAction(
          `「${byId[payment].name}」を奉納し、${type.selectedOptions[0].textContent.trim()}を行います。`,
          () => {
            const answer = game.oracle(state, t, id, payment);
            save();
            render();
            open("お告げ").append(node("p", answer));
          },
        );
      }),
    );
  };
  $("recover").onclick = () => {
    const body = open("カード回収");
    body.append(node("p", "利用可能な札2枚を代価に、捨て札1枚を戻します。"));
    const target = selectField(
        body,
        "戻す札",
        cards.filter((c) => state.cards[c.id] === "discarded"),
      ),
      a = selectField(
        body,
        "代価の札 1",
        cards.filter((c) => state.cards[c.id] === "available"),
      ),
      b = selectField(
        body,
        "代価の札 2",
        cards.filter((c) => state.cards[c.id] === "available"),
      );
    const error = node("p");
    body.append(
      error,
      btn("確認へ", () => {
        if (!target.value || !a.value || !b.value || a.value === b.value) {
          error.textContent = "戻す札と、異なる代価2枚を選んでください。";
          return;
        }
        const id = target.value,
          costs = [a.value, b.value];
        confirmAction(
          `「${costs.map((c) => byId[c].name).join("」「")}」を捨て、「${byId[id].name}」を戻します。`,
          () => {
            game.recover(state, id, costs);
            save();
            render();
            open("カード回収").append(node("p", "札が戻りました。"));
          },
        );
      }),
    );
  };
  function ending() {
    const complete = state.ending === "complete",
      body = open("旅の終わり"),
      land = node("div", undefined, `landscape ${complete ? "complete" : ""}`),
      shadows = node("div", undefined, "shadows");
    chapters.forEach((_, i) => {
      if (complete || !state.chapters[i].solved)
        shadows.append(node("span", undefined, "shadow"));
    });
    land.append(shadows);
    body.append(
      land,
      node(
        "p",
        complete
          ? "すべての書が閉じられた。妖たちの気配は、静かに遠ざかっていく。だが、土地に刻まれた記憶は消えない。"
          : "七つの書は閉じられた。しかし、解かれぬ影は今も東北の地に潜んでいる。",
      ),
    );
    if (complete) body.append(node("p", "語り部", "storyteller"));
    $("close").hidden = true;
    body.append(
      btn("書に戻る", () => {
        state.ending = null;
        save();
        $("close").hidden = false;
        close();
      }),
    );
  }
  modal.addEventListener("cancel", (e) => {
    if (state.ending) e.preventDefault();
  });
  $("end").onclick = () => {
    game.end(state);
    save();
    ending();
  };
  $("se").onclick = () => {
    state.se = !state.se;
    save();
    render();
    if (state.se) sound(true);
  };
  $("bgm").onclick = () => {
    state.bgm = !state.bgm;
    ambience();
    save();
    render();
  };
  document.addEventListener(
    "pointerdown",
    () => {
      if (state.bgm && !ambient.length) ambience();
    },
    { once: true },
  );
  $("reset").onclick = () =>
    confirmAction(
      "進行・選択・捨て札をすべて消し、最初から始めます。よろしいですか？",
      () => {
        state = game.fresh();
        blocked = false;
        message = "";
        ambience();
        save();
        render();
        close();
      },
    );
  $("help").onclick = () => {
    const body = open("遊び方");
    body.append(
      node(
        "p",
        "書の行数と同じ枚数の札を選び、「解放を試みる」を押してください。札の＋ボタンで名前・説明・画像を拡大できます。",
      ),
      node(
        "p",
        "解放に使った札は以後使えません。不正解後60秒は再挑戦と章移動を待ちます。選択変更・拡大・神のお告げ・カード回収は待機中も操作できます。",
      ),
      node(
        "p",
        "一度挑戦し、待機が終われば未解放でも次の書へ進めます。前の書にも戻れます。最終章を一度試した後、待機中でなければ旅を終えられます。",
      ),
      node(
        "p",
        "進行はこのブラウザに自動保存されます。同じURL・端末・ブラウザで続けてください。シークレットモードや学校の端末設定では保存が消える場合があります。",
      ),
      node(
        "p",
        "画像は既存の未確認候補素材です。本文と札の名前・説明には確定JSONデータを使用しています。",
      ),
    );
  };
  render();
  if (blocked) {
    open("保存データを読み込めません").append(
      node(
        "p",
        "元の保存データを保持しています。必要ならブラウザの保存内容を退避してください。「最初から」で確認後に初期化できます。",
      ),
    );
  } else if (state.ending) ending();
  setInterval(sync, 250);
} catch (e) {
  $("fatal").hidden = false;
  $("fatal").textContent =
    `起動できませんでした。${e.message} 静的HTTPサーバーで起動し、再読み込みしてください。`;
}
