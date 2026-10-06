import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const read = (name) => readFileSync(join(root, name), "utf8");

function inline(html, tag, content) {
  if (!html.includes(tag)) throw new Error(`Not found in index.html: ${tag}`);
  return html.replace(tag, () => content);
}

const script = (name) => `<script>\n${read(name).replace(/<\/script/gi, "<\\/script")}\n</script>`;
const eye = `data:image/png;base64,${readFileSync(join(root, "eye.png")).toString("base64")}`;

let html = read("index.html");
html = inline(html, '<link rel="stylesheet" href="styles.css" />', `<style>\n${read("styles.css")}\n</style>`);
html = inline(html, 'src="eye.png"', `src="${eye}"`);
html = inline(html, '<script src="logic.js"></script>', script("logic.js"));
html = inline(html, '<script src="game.js"></script>', script("game.js"));

mkdirSync(join(root, "dist"), { recursive: true });
const out = join(root, "dist", "lightsout.html");
writeFileSync(out, html);
console.log(`${out} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
