# Photography Portfolio

A plain HTML/CSS/JavaScript site — no build step, no dependencies. Open
`index.html` in a browser and it works.

---

## For the site owner: how to update things

Everything you'd normally want to change lives in the **`content/`** folder.
You never need to touch the HTML.

### Add photos

1. Drop the photos into a folder named after the year and the album:

   ```
   images/2025/Beach Trip/photo-01.jpg
   images/2025/Beach Trip/photo-02.jpg
   ```

2. Open **`content/gallery.js`** and add a matching block at the top:

   ```js
   {
     year: 2025,
     albums: [
       {
         title: "Beach Trip",
         description: "A sentence or two about the album.",
         photos: [
           "images/2025/Beach Trip/photo-01.jpg",
           "images/2025/Beach Trip/photo-02.jpg"
         ]
       }
     ]
   },
   ```

3. Save and refresh. Years sort newest-first automatically — the order you
   type them in doesn't matter.

A few rules that will save you a headache:

- Every line inside a list ends with a comma, except the last one.
- Text goes inside `"double quotes"`.
- Paths are typed exactly as the folder is named, spaces and all.

### Change how an album is arranged

Add a `layout:` line to any album in `content/gallery.js`:

| `layout:` | What it does | Best for |
|---|---|---|
| `"justified"` | Photos are grouped into rows, each row filling the full width with every photo in it at the same height. Widths follow each photo's own shape, so nothing is cropped or stretched. Works out the row breaks itself, however many photos there are. | Almost everything — this is what every album currently uses |
| *(leave it out)* | Masonry columns, up to three across, with photos of differing heights | A ragged, scrapbook feel |
| `"plus"` | Three across with the outer two dropped down and a fourth centred underneath, forming a plus sign | Exactly four photos, when you want something playful |

For example:

```js
{
  title: "Beach Trip",
  description: "...",
  layout: "justified",
  photos: [ ... ]
}
```

Your choice is remembered when you re-run the rebuild command.

**One catch:** descriptions and layouts are remembered by album *title*. If you
rename an album folder, the rebuild will treat it as a brand new album and you
will need to type its description and layout again.

### Change your name, bio, or contact details

Open **`content/site.js`**. Name, tagline, banner image, About paragraphs, and
contact info are all in there with comments explaining each field.

### Update the Instagram reels

Run this whenever you post a new reel:

```
node tools/sync-reels.js
```

It reads the username in `content/site.js`, finds your recent reels, downloads
each cover image into `images/reels/`, and rewrites `content/videos.js`. No
password, no login, no setup.

Re-running is safe. It keeps any title or description you've edited by hand,
keeps anything marked `hidden: true` hidden, leaves your YouTube/Vimeo entries
alone, and doesn't re-download covers it already has.

It reads your whole posting history a page at a time, pausing between pages, so
give it a few seconds.

Two things worth knowing:

- **Run it repeatedly and Instagram will start saying "please wait a few
  minutes."** Harmless — the script stops and leaves `content/videos.js`
  exactly as it was. Wait ten minutes and run it again.
- **It uses the endpoint Instagram's own website uses**, not an official API.
  It works today, but Instagram could change it. If it ever stops working
  nothing on the site breaks — `content/videos.js` keeps what it already had.

To hide a reel without deleting it, add `hidden: true` to its entry.

### Add a reel by hand, or a YouTube / Vimeo video

Open **`content/videos.js`** — instructions and examples are at the top.

For a reel: save a still frame into `images/reels/`, then add an entry with
`reel:` (the Share → Copy link url) and `thumbnail:` (your image). If a
thumbnail is ever missing or misspelled the card still works — it just shows a
plain placeholder.

For a film: add an entry with `embed:` and the *embed* url rather than the
normal watch url. These play right on the page and are never overwritten by the
sync script.

When both kinds are present the page splits them under "Films" and "Reels"
headings. With only one kind, there are no headings. Until you add anything,
the page shows a "coming soon" note.

### Swap the banner

Replace `images/banner/image.png` with your own image (a wide shot works best —
roughly 1600×600 or wider), or point `banner:` in `content/site.js` at a
different file.

---

## Resizing photos before upload

Camera files are huge and will make the site slow. Before adding photos, resize
them so the longest edge is about 2000px. On a Mac you can do this without any
extra software — select the photos in Finder, right-click → **Quick Actions →
Convert Image**, and pick a smaller size.

---

## Project layout

```
index.html          Home — the photography gallery
video.html          Video page
about.html          About page
contact.html        Contact page

content/
  site.js           Name, tagline, banner, bio, contact details
  gallery.js        All photo albums
  videos.js         All videos
  photo-sizes.js    Generated — don't edit. Lets the gallery lay itself out
                    before the photos load, so the page doesn't jump around.

assets/
  css/site.css      All styling
  js/site.js        Renders the pages from the content files

images/             Your photos, organised by year and album
  banner/           The home page banner image
  About Me/         The About page portrait
  reels/            Thumbnails for Instagram reels
```

---

## How the reel sync works, and why it's a command

The site itself never talks to Instagram. Browsers block a web page from
reading instagram.com directly, so a live feed isn't possible without a server.

Instead, `tools/sync-reels.js` is run by hand on your own computer. It asks
Instagram for the public profile data, then **downloads each cover image into
`images/reels/`**. That last part matters: Instagram's image links carry an
expiry date and stop working after a few days, so a site that linked straight
to them would quietly go blank. Keeping our own copies means the Video page
stays fast, self-contained, and works forever.

The trade-off is that new reels appear when you run the command, not the moment
you post. For a portfolio that's a fair deal, and it means there's no account
to connect, no token to renew, and nothing to break silently.

---

## Publishing it

The site is fully static, so any of these work with zero configuration:

- **Netlify** — drag the whole folder onto <https://app.netlify.com/drop>
- **GitHub Pages** — push the folder to a repo, enable Pages in settings
- **Cloudflare Pages** / **Vercel** — connect the repo, no build command needed

---

## Adding a CMS later

Content is already separated from presentation, which is the part that makes
this easy. To move to a CMS, keep the same data shape and change where it comes
from:

- **Decap CMS** (free, git-based) — point it at `content/` and give the owner a
  web editor that writes back to the repo. Closest thing to "no change at all".
- **Sanity / Contentful** — replace the `<script src="content/gallery.js">` tag
  with a `fetch()` that returns the same array shape, and `assets/js/site.js`
  keeps working untouched.

Nothing in the rendering code cares where the data came from.
