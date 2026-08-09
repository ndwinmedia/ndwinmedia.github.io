#!/usr/bin/env node
/* ============================================================================
   REBUILD THE GALLERY FILE FROM THE IMAGES FOLDER

   Usage (from the project folder, in Terminal):

       node tools/rebuild-gallery.js

   It scans images/<YEAR>/<Album Name>/ and rewrites content/gallery.js so the
   photo lists match what is actually on disk. Any descriptions you have
   already written are kept — only the file lists are refreshed.

   This is a convenience, not a requirement: content/gallery.js can always be
   edited by hand instead.
   ========================================================================== */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "images");
const OUTPUT = path.join(ROOT, "content", "gallery.js");
const SIZES_OUTPUT = path.join(ROOT, "content", "photo-sizes.js");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const IGNORED_TOP_LEVEL = new Set(["banner"]);

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/* Read a photo's pixel size straight out of the file header, so the gallery
   can work out its layout before any image has downloaded. Returns [w, h], or
   null for a format we don't parse — the page then measures it in the browser
   instead. */
function imageSize(file) {
  let data;
  try {
    data = fs.readFileSync(file);
  } catch {
    return null;
  }

  // PNG: IHDR always sits at a fixed offset.
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) {
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
  }

  // JPEG: walk the segment markers looking for a start-of-frame.
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i < data.length - 9) {
      if (data[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = data[i + 1];
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

      if (isStartOfFrame) {
        return [data.readUInt16BE(i + 7), data.readUInt16BE(i + 5)];
      }
      // Padding and standalone markers carry no length field.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        i += 2;
        continue;
      }
      i += 2 + data.readUInt16BE(i + 2);
    }
  }

  return null;
}

function directories(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name);
}

/* Keep a photo in the folder but off the site by putting IGNORE anywhere in
   its filename, or by starting the name with an underscore. Handy for holding
   on to an older edit of a shot without publishing it. */
function isIgnored(name) {
  return name.startsWith("_") || /ignore/i.test(name);
}

function imagesIn(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        !isIgnored(entry.name) &&
        IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    )
    .map((entry) => entry.name)
    .sort(collator.compare);
}

/* Read what has already been written by hand in content/gallery.js — the
   descriptions and the chosen layout — so a rebuild never throws them away.
   Keyed by "<year>/<album title>". */
function existingAlbums() {
  const descriptions = new Map();
  if (!fs.existsSync(OUTPUT)) return descriptions;

  const sandbox = { window: {} };
  try {
    new Function("window", fs.readFileSync(OUTPUT, "utf8")).call(sandbox, sandbox.window);
  } catch (error) {
    console.warn("! Could not read existing descriptions:", error.message);
    return descriptions;
  }

  for (const year of sandbox.window.SITE_GALLERY || []) {
    for (const album of year.albums || []) {
      descriptions.set(`${year.year}/${album.title}`, {
        description: album.description || "",
        layout: album.layout || ""
      });
    }
  }
  return descriptions;
}

function scan(descriptions) {
  return directories(IMAGES_DIR)
    .filter((name) => !IGNORED_TOP_LEVEL.has(name.toLowerCase()) && /^\d{4}$/.test(name))
    .sort((a, b) => Number(b) - Number(a)) // newest year first
    .map((yearName) => {
      const yearDir = path.join(IMAGES_DIR, yearName);

      const albums = directories(yearDir)
        .sort(collator.compare)
        .map((albumName) => {
          const kept = descriptions.get(`${yearName}/${albumName}`) || {};
          return {
            title: albumName,
            description: kept.description || "",
            layout: kept.layout || "",
            photos: imagesIn(path.join(yearDir, albumName)).map(
              (file) => `images/${yearName}/${albumName}/${file}`
            )
          };
        })
        .filter((album) => album.photos.length > 0);

      return { year: Number(yearName), albums };
    })
    .filter((year) => year.albums.length > 0);
}

function serialise(gallery) {
  const quote = (value) => JSON.stringify(value);

  const albumBlock = (album) =>
    [
      "      {",
      `        title: ${quote(album.title)},`,
      `        description: ${quote(album.description)},`,
      ...(album.layout ? [`        layout: ${quote(album.layout)},`] : []),
      "        photos: [",
      album.photos.map((photo) => `          ${quote(photo)}`).join(",\n"),
      "        ]",
      "      }"
    ].join("\n");

  const yearBlock = (year) =>
    [
      "  {",
      `    year: ${year.year},`,
      "    albums: [",
      year.albums.map(albumBlock).join(",\n"),
      "    ]",
      "  }"
    ].join("\n");

  return [
    "/* ============================================================================",
    "   PHOTO GALLERY CONTENT",
    "   ----------------------------------------------------------------------------",
    "   Generated by `node tools/rebuild-gallery.js`, but safe to edit by hand.",
    "",
    "   HOW TO ADD PHOTOS",
    "   1. Put your photos in a folder:  images/<YEAR>/<Album Name>/",
    "   2. Either run the rebuild command above, or add an entry below to match.",
    "   3. Write a description for the album in the `description` field.",
    "",
    "   Descriptions are preserved when you re-run the rebuild command.",
    "   Years are displayed newest-first automatically.",
    "   ========================================================================== */",
    "",
    "window.SITE_GALLERY = [",
    gallery.map(yearBlock).join(",\n\n"),
    "];",
    ""
  ].join("\n");
}

function serialiseSizes(gallery) {
  const lines = [];
  let unknown = 0;

  for (const year of gallery) {
    for (const album of year.albums) {
      for (const photo of album.photos) {
        const size = imageSize(path.join(ROOT, photo));
        if (size) lines.push(`  ${JSON.stringify(photo)}: [${size[0]}, ${size[1]}]`);
        else unknown++;
      }
    }
  }

  const file = [
    "/* ============================================================================",
    "   PHOTO SIZES — GENERATED, DO NOT EDIT",
    "   ----------------------------------------------------------------------------",
    "   Written by `node tools/rebuild-gallery.js`. The gallery uses these to work",
    "   out its row layout before the photos have downloaded, which stops the page",
    "   from jumping around as they appear.",
    "",
    "   Nothing breaks if this file is out of date — anything missing here is simply",
    "   measured in the browser instead.",
    "   ========================================================================== */",
    "",
    "window.SITE_PHOTO_SIZES = {",
    lines.join(",\n"),
    "};",
    ""
  ].join("\n");

  fs.writeFileSync(SIZES_OUTPUT, file, "utf8");
  return { written: lines.length, unknown };
}

function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error("No images/ folder found at", IMAGES_DIR);
    process.exit(1);
  }

  const gallery = scan(existingAlbums());
  fs.writeFileSync(OUTPUT, serialise(gallery), "utf8");

  const sizes = serialiseSizes(gallery);
  console.log(
    `Wrote content/photo-sizes.js — measured ${sizes.written} photos` +
      (sizes.unknown ? `, ${sizes.unknown} left for the browser to measure.` : ".")
  );

  const albumCount = gallery.reduce((sum, year) => sum + year.albums.length, 0);
  const photoCount = gallery.reduce(
    (sum, year) => sum + year.albums.reduce((n, album) => n + album.photos.length, 0),
    0
  );

  console.log(`Wrote content/gallery.js — ${gallery.length} years, ${albumCount} albums, ${photoCount} photos.`);

  const missing = gallery.flatMap((year) =>
    year.albums.filter((album) => !album.description).map((album) => `${year.year} / ${album.title}`)
  );
  if (missing.length) {
    console.log("\nAlbums still needing a description:");
    missing.forEach((name) => console.log("  - " + name));
  }
}

main();
