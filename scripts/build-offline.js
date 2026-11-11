import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const read = (file) => readFile(file, "utf8");
const cards = JSON.parse(await read("cards.json")),
  chapters = JSON.parse(await read("chapters.json"));
const assets = [
  ...new Set([
    ...cards.map((c) => c.image),
    ...chapters.map((c) => `assets/yokai/portraits/${c.id}.png`),
    "assets/scenes/oracle-shrine.png",
    "assets/fonts/YujiSyuku-game.ttf",
  ]),
];
const embedded = {};
for (const file of assets) {
  const mime = file.endsWith(".ttf") ? "font/ttf" : "image/png";
  embedded[file] =
    `data:${mime};base64,${(await readFile(file)).toString("base64")}`;
}
const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
let css = await read("style.css");
css = css.replace(
  /url\(["']?(assets\/[^"')]+)["']?\)/g,
  (_, file) => `url("${embedded[file]}")`,
);
let app = await read("src/app.js");
app = app.replace(/^import .*;\n/gm, "");
const start = app.indexOf("async function load(path)");
const end = app.indexOf("\ntry {", start);
if (start < 0 || end < 0)
  throw Error("Application loader changed; review the offline build.");
app =
  app.slice(0, start) +
  `async function load(file) { return JSON.parse(JSON.stringify(portableData[file])); }\n` +
  app.slice(end);
app = app.replace(/(\b\w+\.src\s*=\s*)([^;\n]+);/g, "$1portableAsset($2);");
const oldBackground =
  'art.style.backgroundImage = `url("assets/yokai/portraits/${chapters[state.current].id}.png?v=bride-2")`;';
if (!app.includes(oldBackground))
  throw Error("Portrait loader changed; review the offline build.");
app = app.replace(
  oldBackground,
  'art.style.backgroundImage = `url("${portableAsset(`assets/yokai/portraits/${chapters[state.current].id}.png`)}")`;',
);
app = app
  .replace(/\blocalStorage\b/g, "portableLocal")
  .replace(/\bsessionStorage\b/g, "portableSession");
app = app.replace(
  '$("save-status").textContent = "";',
  '$("save-status").textContent = portablePersistent ? "" : "この端末では保存できません。画面を閉じると進行が失われます。";',
);
app = app.replace(
  "静的HTTPサーバーで起動し、再読み込みしてください。",
  "HTMLファイルをブラウザで開き直してください。",
);
app = app.replace(
  '  render();\n  $("intro-save")',
  '  render();\n  if (!portablePersistent) $("save-status").textContent = "この端末では保存できません。画面を閉じると進行が失われます。";\n  $("intro-save")',
);
const storage = `
let portablePersistent = true;
function portableStorage(kind) {
 try { const storage=globalThis[kind]; const key='tohoku-storage-check'; storage.setItem(key,'1'); storage.removeItem(key); return storage; }
 catch { if(kind==='localStorage') portablePersistent=false; const memory=new Map(); return {getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)}; }
}
const portableLocal=portableStorage('localStorage'),portableSession=portableStorage('sessionStorage');
`;
const logic = (await read("src/game.js")).replace(/^export /gm, "");
const audio = (await read("src/audio.js")).replace(/^export /gm, "");
const program = `(async()=>{\nconst portableAssets=${json(embedded)};\nconst portableData=${json({ "cards.json": cards, "chapters.json": chapters })};\nfunction portableAsset(file){const key=file.split('?')[0];if(!portableAssets[key])throw Error('同梱素材が見つかりません: '+key);return portableAssets[key];}\n${storage}\n${logic}\n${audio}\n${app}\n})();`;
if (/<\/script/i.test(program)) throw Error("Unsafe inline script boundary.");
let html = await read("index.html");
html = html.replace(/<link\b[^>]*\brel="preload"[^>]*\/>/g, "");
html = html.replace(
  /<link\b[^>]*\brel="stylesheet"[^>]*\/>/,
  `<style>${css}</style>`,
);
html = html.replace(
  /<script type="module" src="[^"]+"><\/script>/,
  () => `<script>${program}</script>`,
);
html = html.replace(
  "東北の地に残る、声なき物語。",
  "東北妖解録 · 単体HTML版（通信不要）",
);
const license = await read("assets/fonts/OFL.txt");
html = html.replace(
  "</body>",
  `<script type="application/json" id="font-license">${json(license)}</script>\n</body>`,
);
if (/(?:src|href)="(?:assets\/|src\/|style\.css)/.test(html))
  throw Error("An external file reference remains.");
await mkdir("dist-offline", { recursive: true });
const file = "dist-offline/tohoku-yokairoku.html";
await writeFile(file, html);
const digest = createHash("sha256").update(html).digest("hex");
await writeFile(
  "dist-offline/SHA256.txt",
  `${digest}  tohoku-yokairoku.html\n`,
);
console.log(
  `Single-file handout: ${file} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MiB), ${assets.length} assets embedded, SHA256 ${digest}`,
);
