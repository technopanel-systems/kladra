/**
 * The app's icons, drawn from the same mark the sidebar shows.
 *
 * Run by hand — `npm run icons` — and the PNGs it writes are committed. A
 * deploy never runs it: an installed app whose icon depends on an image
 * library being present at build time is an app that ships without an icon on
 * the one machine where that library did not compile.
 *
 * The K is paths, not text. An SVG renderer resolves a font name against the
 * fonts on the machine it runs on, and a missing IBM Plex would silently give
 * a different letter, a fallback serif, or nothing at all.
 *
 * Three shapes, because the platforms want three:
 * - `any` — a rounded square, used exactly as drawn, so it needs its own
 *   corners and a little air around them.
 * - `maskable` — full bleed, with the glyph inside the middle 80%. Android
 *   crops it to whatever shape the launcher uses, and anything outside that
 *   circle can be cut off.
 * - `apple-touch-icon` — full bleed and no transparency; iOS rounds it itself
 *   and paints black behind anything see-through.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

/** --mark-grad in src/app/globals.css, and --brand-ink for the letter. */
const GRADIENT_FROM = "#e5233c";
const GRADIENT_TO = "#7a1020";
const INK = "#ffffff";

const OUT = join(process.cwd(), "public", "icons");

/**
 * The letter, in a 100×100 box: a stem, and two arms that are STROKES rather
 * than filled quads.
 *
 * A stroke is a band of constant width along a line, which is what an arm is.
 * The first two attempts drew each arm as a four-cornered polygon, and both
 * were wrong in a way only the rendered PNG showed — one left a dark nick where
 * the arms met the stem, the other tapered to a point at the top right, because
 * a quad whose corners are placed by eye is not a band of constant thickness.
 *
 * Both arms start at (39, 50), two units inside the stem's right edge, so the
 * junction is solid. Their far ends are cut square across the diagonal, which
 * is why they stop at 27 and 73 rather than at the stem's 22 and 78 — the cut
 * is perpendicular to the arm, so it reaches about six units past its centre.
 */
const GLYPH = `
    <rect x="27" y="22" width="14" height="56"/>
    <path d="M39 50 L78 27" stroke="${INK}" stroke-width="14" fill="none"/>
    <path d="M39 50 L78 73" stroke="${INK}" stroke-width="14" fill="none"/>`;

type Shape = "rounded" | "bleed";

function svg(size: number, shape: Shape, glyphScale: number): string {
  // The glyph is centred and scaled about the middle of the 100×100 box, so
  // one number moves it in and out of a launcher's safe zone.
  const offset = (100 - 100 * glyphScale) / 2;
  const radius = shape === "rounded" ? 22 : 0;
  const inset = shape === "rounded" ? 2 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="mark" x1="0" y1="0" x2="0.72" y2="1">
      <stop offset="0" stop-color="${GRADIENT_FROM}"/>
      <stop offset="1" stop-color="${GRADIENT_TO}"/>
    </linearGradient>
  </defs>
  <rect x="${inset}" y="${inset}" width="${100 - inset * 2}" height="${100 - inset * 2}" rx="${radius}" ry="${radius}" fill="url(#mark)"/>
  <g transform="translate(${offset} ${offset}) scale(${glyphScale})" fill="${INK}">${GLYPH}
  </g>
</svg>`;
}

type Icon = { file: string; size: number; shape: Shape; glyph: number; opaque?: boolean };

const ICONS: Icon[] = [
  { file: "icon-192.png", size: 192, shape: "rounded", glyph: 0.72 },
  { file: "icon-512.png", size: 512, shape: "rounded", glyph: 0.72 },
  // 0.62 keeps every corner of the K inside the middle 80% Android may keep.
  { file: "maskable-192.png", size: 192, shape: "bleed", glyph: 0.62 },
  { file: "maskable-512.png", size: 512, shape: "bleed", glyph: 0.62 },
  { file: "apple-touch-icon.png", size: 180, shape: "bleed", glyph: 0.68, opaque: true },
];

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });

  for (const icon of ICONS) {
    const source = Buffer.from(svg(icon.size, icon.shape, icon.glyph));
    let image = sharp(source, { density: 384 }).resize(icon.size, icon.size);
    if (icon.opaque) image = image.flatten({ background: GRADIENT_TO });
    const png = await image.png({ compressionLevel: 9 }).toBuffer();
    await writeFile(join(OUT, icon.file), png);
    console.log(`  ${icon.file.padEnd(24)} ${String(png.length).padStart(6)} bytes`);
  }

  console.log(`icons — ${ICONS.length} written to public/icons`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
