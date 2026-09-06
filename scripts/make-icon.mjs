/**
 * 生成应用图标 assets/app.ico（流萤火花主题：暗色圆角底 + 发光萤火 + 翅膀轨迹）。
 * 运行：pnpm exec node scripts/make-icon.mjs
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();
const svg = `<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#2a2f42"/>
      <stop offset="100%" stop-color="#12141d"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff7e0"/>
      <stop offset="35%" stop-color="#ffcf6e"/>
      <stop offset="70%" stop-color="#ff8a2a" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ff7a18" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="56" fill="url(#bg)"/>
  <circle cx="118" cy="126" r="76" fill="url(#glow)"/>
  <circle cx="118" cy="126" r="20" fill="#fff3d6"/>
  <path d="M150 94 q48 -20 62 18" stroke="#ffd9a0" stroke-opacity="0.85" stroke-width="11" fill="none" stroke-linecap="round"/>
  <path d="M154 136 q52 6 50 44" stroke="#ffb265" stroke-opacity="0.7" stroke-width="9" fill="none" stroke-linecap="round"/>
  <circle cx="198" cy="64" r="6" fill="#ffd9a0" opacity="0.9"/>
  <circle cx="70" cy="198" r="5" fill="#ffb265" opacity="0.8"/>
  <circle cx="206" cy="198" r="4" fill="#ffcf6e" opacity="0.7"/>
  <circle cx="58" cy="70" r="4" fill="#ffcf6e" opacity="0.6"/>
</svg>`;

const sizes = [256, 128, 64, 48, 32, 24, 16];
const pngs = [];
for (const size of sizes) {
	const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
	pngs.push(buf);
	await sharp(buf).toFile(path.join(root, "assets", `icon-${size}.png`));
}
const ico = await pngToIco(pngs.reverse());
fs.mkdirSync(path.join(root, "assets"), { recursive: true });
fs.writeFileSync(path.join(root, "assets", "app.ico"), ico);
console.log("已生成 assets/app.ico (" + ico.length + " bytes) 与预览 PNG。");
