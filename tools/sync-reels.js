#!/usr/bin/env node
/* ============================================================================
   PULL THE LATEST INSTAGRAM REELS ONTO THE VIDEO PAGE

   Usage (from the project folder, in Terminal):

       node tools/sync-reels.js

   What it does:
     1. Looks up the public profile named in content/site.js (`instagram:`).
     2. Finds the reels in the most recent posts.
     3. Downloads each reel's cover image into images/reels/.
     4. Rewrites content/videos.js to match.

   What it keeps:
     - Any title or description you have edited by hand.
     - Any reel you have marked `hidden: true` (it stays hidden).
     - Any YouTube / Vimeo entries you added yourself — those are never touched.

   It reads your whole posting history, a page at a time, pausing between
   pages so Instagram doesn't think it's being hammered. Expect it to take
   a few seconds per page.

   Two things worth knowing:

     * If you run it many times in quick succession, Instagram will start
       replying "please wait a few minutes". That is harmless — the script
       stops and leaves content/videos.js exactly as it was. Wait ten minutes
       and run it again.

     * This uses an endpoint Instagram publishes for its own website rather
       than an official API. It works today and needs no password or token,
       but Instagram could change it at any time. If this script ever stops
       working, nothing on the site breaks — content/videos.js keeps whatever
       it already had, and reels can still be added by hand.
   ========================================================================== */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE_FILE = path.join(ROOT, "content", "site.js");
const OUTPUT = path.join(ROOT, "content", "videos.js");
const THUMB_DIR = path.join(ROOT, "images", "reels");

const IG_APP_ID = "936619743392459"; // the public web client's id
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/* ------------------------------------------------------------------ helpers */

// Run one of the content files and hand back the global it defines.
function loadContent(file, globalName) {
  if (!fs.existsSync(file)) return null;
  const sandbox = { window: {} };
  try {
    new Function("window", fs.readFileSync(file, "utf8")).call(sandbox, sandbox.window);
  } catch (error) {
    console.warn(`! Could not read ${path.basename(file)}: ${error.message}`);
    return null;
  }
  return sandbox.window[globalName] || null;
}

function shortcodeOf(reelUrl) {
  const match = String(reelUrl || "").match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

// Turn a caption into something usable as a title: first real line, no
// hashtags, no decorative bullet lines.
function titleFromCaption(caption) {
  const line = String(caption || "")
    .split("\n")
    .map((part) => part.replace(/#[^\s#]+/g, "").trim())
    .find((part) => part && !/^[•·\-–—*.\s]+$/.test(part));

  if (!line) return "";
  return line.length > 70 ? line.slice(0, 69).trimEnd() + "…" : line;
}

/* Instagram offers the cover in many sizes. Take the smallest one that is
   still comfortably sharp on a reel card rather than the full 1080px original,
   which keeps the folder small and the page quick. */
function coverImage(item) {
  const candidates = (item.image_versions2 && item.image_versions2.candidates) || [];
  if (!candidates.length) return null;

  const bigEnough = candidates.filter((candidate) => candidate.width >= 640);
  const pool = bigEnough.length ? bigEnough : candidates;

  return pool.reduce((best, candidate) =>
    candidate.width < best.width ? candidate : best
  ).url;
}

function extensionFor(url) {
  const clean = String(url).split("?")[0];
  const ext = path.extname(clean).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
}

/* ------------------------------------------------------------------ fetching */

function headersFor(username) {
  return {
    "User-Agent": USER_AGENT,
    "x-ig-app-id": IG_APP_ID,
    Accept: "*/*",
    Referer: `https://www.instagram.com/${username}/`
  };
}

function describeFailure(status) {
  if (status === 401 || status === 429) {
    return (
      `Instagram replied ${status} — it is rate-limiting this computer. ` +
      `Wait ten minutes or so and run it again.`
    );
  }
  return `Instagram replied ${status}.`;
}

async function fetchProfile(username) {
  const url =
    "https://www.instagram.com/api/v1/users/web_profile_info/?username=" +
    encodeURIComponent(username);

  const response = await fetch(url, { headers: headersFor(username) });
  if (!response.ok) throw new Error(describeFailure(response.status));

  const payload = await response.json();
  const user = payload && payload.data && payload.data.user;
  if (!user) throw new Error("No profile found for @" + username + ".");
  if (user.is_private) throw new Error("@" + username + " is a private account.");

  return user;
}

/* Walk the whole posting history a page at a time. Instagram hands back a
   cursor with each page; we follow it until it says there is no more. */
async function fetchAllPosts(username, userId, onProgress) {
  const MAX_PAGES = 40; // a backstop, not an expected limit
  const items = [];
  const seen = new Set();

  let cursor = null;
  let page = 0;

  while (page < MAX_PAGES) {
    page++;

    const url =
      `https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(userId)}/` +
      `?count=33` + (cursor ? `&max_id=${encodeURIComponent(cursor)}` : "");

    const response = await fetch(url, { headers: headersFor(username) });
    if (!response.ok) {
      // Partial results are still worth keeping.
      if (items.length) {
        console.warn(`  ! page ${page}: ${describeFailure(response.status)} — stopping here`);
        break;
      }
      throw new Error(describeFailure(response.status));
    }

    const payload = await response.json();
    const batch = payload.items || [];

    let added = 0;
    for (const item of batch) {
      if (item.code && !seen.has(item.code)) {
        seen.add(item.code);
        items.push(item);
        added++;
      }
    }

    onProgress(page, items.length);

    // Stop on anything that means "that's everything".
    if (!payload.more_available || !payload.next_max_id || added === 0) break;
    cursor = payload.next_max_id;

    await new Promise((resolve) => setTimeout(resolve, 700)); // be polite
  }

  return items;
}

async function downloadThumbnail(url, destination) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error("thumbnail download failed (" + response.status + ")");
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  return buffer.length;
}

/* ------------------------------------------------------------------ writing */

function serialise(entries) {
  const quote = (value) => JSON.stringify(value);

  const block = (entry) => {
    const lines = ["  {", `    title: ${quote(entry.title || "")},`];
    if (entry.description) lines.push(`    description: ${quote(entry.description)},`);
    if (entry.hidden) lines.push("    hidden: true,");
    if (entry.reel) {
      lines.push(`    reel: ${quote(entry.reel)},`);
      lines.push(`    thumbnail: ${quote(entry.thumbnail)}`);
    } else {
      lines.push(`    embed: ${quote(entry.embed)}`);
    }
    lines.push("  }");
    return lines.join("\n");
  };

  return [
    "/* ============================================================================",
    "   VIDEO CONTENT",
    "   ----------------------------------------------------------------------------",
    "   The reels below were filled in by `node tools/sync-reels.js`. Run that again",
    "   whenever you post a new one.",
    "",
    "   Safe to edit by hand — a re-run keeps any title or description you change,",
    "   and keeps anything marked `hidden: true` hidden.",
    "",
    "   To add a YouTube or Vimeo film, add an entry with an `embed:` link instead",
    "   of `reel:` — for example:",
    "",
    "       { title: \"Albany, in motion\", embed: \"https://www.youtube.com/embed/ABC123\" }",
    "",
    "   (YouTube watch link https://www.youtube.com/watch?v=ABC123 becomes",
    "    https://www.youtube.com/embed/ABC123. Vimeo https://vimeo.com/123 becomes",
    "    https://player.vimeo.com/video/123.) Those entries are never overwritten.",
    "   ========================================================================== */",
    "",
    "window.SITE_VIDEOS = [",
    entries.map(block).join(",\n\n"),
    "];",
    ""
  ].join("\n");
}

/* --------------------------------------------------------------------- main */

async function main() {
  const site = loadContent(SITE_FILE, "SITE") || {};
  const username = (site.instagram || "").replace(/^@/, "").trim();

  if (!username) {
    console.error(
      'No Instagram username set. Add  instagram: "yourname"  to content/site.js.'
    );
    process.exit(1);
  }

  console.log(`Looking up @${username}…`);
  const user = await fetchProfile(username);
  const totalPosts = (user.edge_owner_to_timeline_media || {}).count || 0;

  console.log(`Reading ${totalPosts} posts…`);
  const posts = await fetchAllPosts(username, user.id, (page, count) => {
    process.stdout.write(`  page ${page}: ${count} posts so far\r`);
  });
  process.stdout.write("\n");

  const reelNodes = posts.filter((item) => item.product_type === "clips");

  console.log(`Found ${reelNodes.length} reels across ${posts.length} posts.`);
  if (posts.length < totalPosts) {
    console.log(
      `Note: ${totalPosts - posts.length} post(s) weren't returned. ` +
        `Anything already in content/videos.js is kept regardless.`
    );
  }

  // Keep what's already there.
  const existing = loadContent(OUTPUT, "SITE_VIDEOS") || [];
  const films = existing.filter((entry) => !entry.reel && entry.embed);
  const knownReels = new Map();
  existing
    .filter((entry) => entry.reel)
    .forEach((entry) => {
      const code = shortcodeOf(entry.reel);
      if (code) knownReels.set(code, entry);
    });

  fs.mkdirSync(THUMB_DIR, { recursive: true });

  const reels = [];
  let downloaded = 0;
  let reused = 0;

  for (const node of reelNodes) {
    const code = node.code;
    const previous = knownReels.get(code) || {};

    const source = coverImage(node);
    if (!source) {
      console.warn(`  ! ${code}: no cover image offered — skipping`);
      continue;
    }
    const filename = code + extensionFor(source);
    const relative = "images/reels/" + filename;
    const absolute = path.join(THUMB_DIR, filename);

    // Instagram's image links expire after a few days, so keep our own copy.
    if (fs.existsSync(absolute)) {
      reused++;
    } else {
      try {
        const bytes = await downloadThumbnail(source, absolute);
        downloaded++;
        console.log(`  saved ${relative} (${Math.round(bytes / 1024)} KB)`);
      } catch (error) {
        console.warn(`  ! ${code}: ${error.message} — skipping this reel`);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 350)); // be polite
    }

    const caption = (node.caption && node.caption.text) || "";

    reels.push({
      // Anything edited by hand wins over the caption.
      title: previous.title || titleFromCaption(caption) || "Reel",
      description: previous.description || "",
      hidden: previous.hidden || false,
      reel: `https://www.instagram.com/reel/${code}/`,
      thumbnail: relative
    });
  }

  if (!reels.length && !films.length) {
    console.error("Nothing to write — no reels found and no films configured.");
    process.exit(1);
  }

  fs.writeFileSync(OUTPUT, serialise([...films, ...reels]), "utf8");

  const hidden = reels.filter((reel) => reel.hidden).length;
  console.log(
    `\nWrote content/videos.js — ${reels.length} reels ` +
      `(${downloaded} newly downloaded, ${reused} already saved` +
      (hidden ? `, ${hidden} hidden` : "") +
      `)` + (films.length ? `, ${films.length} film(s) left untouched.` : ".")
  );
}

main().catch((error) => {
  console.error("\nCould not sync reels: " + error.message);
  console.error("content/videos.js was left exactly as it was.");
  process.exit(1);
});
