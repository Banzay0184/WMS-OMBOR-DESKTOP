import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@vladmandic", "face-api", "model");
const dest = join(root, "public", "models");

if (!existsSync(src)) {
  console.warn("[copy-face-models] @vladmandic/face-api не установлен — пропуск.");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[copy-face-models] Модели скопированы в public/models");

const logoSrc = join(root, "src", "assets", "LOGO.png");
const logoDest = join(root, "public", "favicon.png");
if (existsSync(logoSrc)) {
  cpSync(logoSrc, logoDest);
  console.log("[copy-face-models] favicon.png обновлён из LOGO.png");
}
