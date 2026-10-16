import { mkdir, rm, cp, readFile, access } from "node:fs/promises";
const cards = JSON.parse(await readFile("cards.json", "utf8"));
for (const c of cards) await access(c.image);
await access("assets/yokai/atlas-cinematic.png");
await access("assets/fonts/YujiSyuku-game.ttf");
await access("assets/fonts/OFL.txt");
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
for (const path of [
  "index.html",
  "style.css",
  "src",
  "assets",
  "cards.json",
  "chapters.json",
])
  await cp(path, `dist/${path}`, { recursive: true });
console.log("Static site built: dist/ (54 card images included)");
