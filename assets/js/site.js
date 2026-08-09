/* ==========================================================================
   Site behaviour: renders pages from the files in /content and wires up the
   navigation + photo lightbox. Nothing here needs to be edited to add content.
   ========================================================================== */

(function () {
  "use strict";

  var SITE = window.SITE || {};

  /* ------------------------------------------------------------------ utils */

  // Paths in the content files are written the natural way ("images/2023/
  // Diploma & Drip/IMG_9166.jpg"). Encode each segment so spaces and other
  // characters resolve correctly as a URL.
  function encodePath(path) {
    return String(path)
      .split("/")
      .map(encodeURIComponent)
      .join("/");
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  /* ----------------------------------------------------------- shared chrome */

  function applyIdentity() {
    document.querySelectorAll("[data-site-name]").forEach(function (node) {
      node.textContent = SITE.name || "Portfolio";
    });

    var year = new Date().getFullYear();
    document.querySelectorAll("[data-current-year]").forEach(function (node) {
      node.textContent = year;
    });
  }

  function markCurrentNavLink() {
    var file = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav a").forEach(function (link) {
      var target = link.getAttribute("href");
      if (target === file) link.setAttribute("aria-current", "page");
    });
  }

  function setupNavToggle() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.querySelector(".nav");
    if (!toggle || !nav) return;

    var mobile = window.matchMedia("(max-width: 720px)");

    function sync() {
      if (mobile.matches) {
        nav.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      } else {
        nav.hidden = false;
      }
    }

    toggle.addEventListener("click", function () {
      var open = nav.hidden;
      nav.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    });

    mobile.addEventListener("change", sync);
    sync();
  }

  /* ----------------------------------------------------------------- banner */

  function renderBanner() {
    var mount = document.querySelector("[data-banner]");
    if (!mount) return;

    var img = el("img", "banner__image");
    img.src = encodePath(SITE.banner || "");
    img.alt = "";
    img.setAttribute("fetchpriority", "high");

    var caption = el("div", "banner__caption");
    caption.appendChild(el("h1", "banner__name", SITE.name || ""));
    if (SITE.tagline) caption.appendChild(el("p", "banner__tagline", SITE.tagline));
    if (SITE.subtitle) caption.appendChild(el("p", "banner__subtitle", SITE.subtitle));

    mount.appendChild(img);
    mount.appendChild(el("div", "banner__scrim"));
    mount.appendChild(caption);
  }

  /* ---------------------------------------------------------------- gallery */

  // Flat list of every photo on the page, in display order — this is what the
  // lightbox steps through.
  var lightboxItems = [];

  function buildPhoto(photo, albumTitle, index) {
    var button = el("button", "photo");
    button.type = "button";
    button.setAttribute("aria-label", "Open photo " + (index + 1) + " from " + albumTitle);

    var img = el("img");
    img.src = encodePath(photo);
    img.alt = albumTitle + " — photo " + (index + 1);
    img.loading = "lazy";
    img.decoding = "async";

    // The photo's true shape drives the "justified" layout, where every image
    // in a row is shown at the same height.
    function reveal() {
      img.classList.add("is-loaded");
      if (img.naturalWidth && img.naturalHeight) {
        button.style.setProperty("--ar", img.naturalWidth / img.naturalHeight);
        // Only matters when a photo is missing from content/photo-sizes.js —
        // the real shape has just arrived, so the rows may need redrawing.
        if (!(window.SITE_PHOTO_SIZES || {})[photo]) scheduleJustify();
      }
    }
    if (img.complete) reveal();
    else img.addEventListener("load", reveal);
    img.addEventListener("error", reveal);

    button.appendChild(img);

    var position = lightboxItems.length;
    lightboxItems.push({ src: img.src, caption: albumTitle });
    button.addEventListener("click", function () { openLightbox(position); });

    return button;
  }

  /* ------------------------------------------------- justified row layout */

  var GRID_GAP = 14;
  var justifiedGrids = [];

  function photoRatio(item) {
    var sizes = window.SITE_PHOTO_SIZES || {};
    var known = sizes[item.path];
    if (known && known[0] && known[1]) return known[0] / known[1];
    if (item.img.naturalWidth && item.img.naturalHeight) {
      return item.img.naturalWidth / item.img.naturalHeight;
    }
    return 0.72; // a typical portrait, used only until the file arrives
  }

  /* Choose where to break rows so every row ends up near the target height.
     Cost is the squared log-ratio of a row's height against the target, which
     treats "twice too tall" and "half too short" as equally bad and heavily
     punishes a lone stretched photo on the last row. Solved exactly with a
     small dynamic program rather than a greedy pass, which is what stops a
     good early row from forcing an ugly final one. */
  function planRows(ratios, width, target) {
    var count = ratios.length;
    var MAX_PER_ROW = 5;
    var best = [0];
    var from = [0];

    for (var end = 1; end <= count; end++) {
      best[end] = Infinity;
      from[end] = end - 1;

      for (var start = Math.max(0, end - MAX_PER_ROW); start < end; start++) {
        var sum = 0;
        for (var k = start; k < end; k++) sum += ratios[k];

        var height = (width - GRID_GAP * (end - start - 1)) / sum;
        var deviation = Math.log(height / target);
        var total = best[start] + deviation * deviation;

        if (total < best[end]) {
          best[end] = total;
          from[end] = start;
        }
      }
    }

    var rows = [];
    for (var i = count; i > 0; i = from[i]) rows.unshift(i - from[i]);
    return rows;
  }

  function justify(grid) {
    var items = grid.__items;
    if (!items || !items.length) return;

    var width = grid.clientWidth;
    if (!width) return;

    var ratios = items.map(photoRatio);

    // Below the stacking breakpoint every photo gets its own full-width row.
    var rows;
    if (width < 560) {
      rows = items.map(function () { return 1; });
    } else {
      var target = Math.max(320, Math.min(560, width * 0.42));
      rows = planRows(ratios, width, target);
    }

    grid.textContent = "";
    var index = 0;

    rows.forEach(function (perRow) {
      var row = el("div", "album__row");
      for (var i = 0; i < perRow; i++, index++) {
        var item = items[index];
        item.el.style.flex = ratios[index] + " 1 0";
        item.el.style.aspectRatio = String(ratios[index]);
        row.appendChild(item.el);
      }
      grid.appendChild(row);
    });
  }

  function justifyAll() {
    justifiedGrids.forEach(justify);
  }

  var justifyTimer = null;
  function scheduleJustify() {
    clearTimeout(justifyTimer);
    justifyTimer = setTimeout(justifyAll, 60);
  }

  window.addEventListener("resize", scheduleJustify);

  function buildAlbum(album) {
    var section = el("section", "album");

    var header = el("div", "album__header");
    header.appendChild(el("h3", "album__title", album.title || "Untitled"));
    if (album.description) {
      header.appendChild(el("p", "album__description", album.description));
    }
    section.appendChild(header);

    var photos = album.photos || [];
    var layout = album.layout || "masonry";

    var grid = el("div", "album__grid album__grid--" + layout);

    if (layout === "masonry") {
      // Small albums shouldn't leave an empty trailing column.
      grid.style.setProperty("--columns", String(Math.min(3, Math.max(1, photos.length))));
    }

    var items = photos.map(function (photo, i) {
      return {
        el: buildPhoto(photo, album.title || "Untitled", i),
        path: photo
      };
    });

    items.forEach(function (item) {
      item.img = item.el.querySelector("img");
      grid.appendChild(item.el);
    });

    if (layout === "justified") {
      grid.__items = items;
      justifiedGrids.push(grid);
    }

    section.appendChild(grid);

    return section;
  }

  function buildYear(entry) {
    var section = el("section", "year");

    var albums = entry.albums || [];
    var photoCount = albums.reduce(function (sum, album) {
      return sum + (album.photos ? album.photos.length : 0);
    }, 0);

    var label = el("div", "year__label");
    label.appendChild(el("h2", "year__number", String(entry.year)));
    label.appendChild(el("span", "year__rule"));
    label.appendChild(el("span", "year__count", plural(photoCount, "photo")));
    section.appendChild(label);

    albums.forEach(function (album) {
      section.appendChild(buildAlbum(album));
    });

    return section;
  }

  function renderGallery() {
    var mount = document.querySelector("[data-gallery]");
    if (!mount) return;

    var data = (window.SITE_GALLERY || []).slice().sort(function (a, b) {
      return b.year - a.year; // newest year first
    });

    if (!data.length) {
      mount.appendChild(emptyState("No photos yet", "Add an album to content/gallery.js to see it here."));
      return;
    }

    var fragment = document.createDocumentFragment();
    data.forEach(function (entry) { fragment.appendChild(buildYear(entry)); });
    mount.appendChild(fragment);

    // Rows can only be measured once the grids are in the document.
    justifyAll();
  }

  /* --------------------------------------------------------------- lightbox */

  var lightbox = null;
  var lightboxImage = null;
  var lightboxCaption = null;
  var activeIndex = 0;
  var lastFocused = null;

  function ensureLightbox() {
    if (lightbox) return lightbox;

    lightbox = el("div", "lightbox");
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", "Photo viewer");

    var figure = el("figure", "lightbox__figure");
    lightboxImage = el("img", "lightbox__image");
    lightboxImage.alt = "";
    lightboxCaption = el("figcaption", "lightbox__caption");
    figure.appendChild(lightboxImage);
    figure.appendChild(lightboxCaption);
    lightbox.appendChild(figure);

    lightbox.appendChild(lightboxButton("close", "✕", "Close", closeLightbox));
    lightbox.appendChild(lightboxButton("prev", "‹", "Previous photo", function () { step(-1); }));
    lightbox.appendChild(lightboxButton("next", "›", "Next photo", function () { step(1); }));

    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox || event.target === figure) closeLightbox();
    });

    document.body.appendChild(lightbox);
    return lightbox;
  }

  function lightboxButton(kind, glyph, label, handler) {
    var button = el("button", "lightbox__btn lightbox__btn--" + kind, glyph);
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      handler();
    });
    return button;
  }

  function show(index) {
    var item = lightboxItems[index];
    if (!item) return;
    activeIndex = index;
    lightboxImage.src = item.src;
    lightboxCaption.textContent =
      item.caption + " · " + (index + 1) + " / " + lightboxItems.length;
  }

  function step(delta) {
    var next = (activeIndex + delta + lightboxItems.length) % lightboxItems.length;
    show(next);
  }

  function openLightbox(index) {
    lastFocused = document.activeElement;
    ensureLightbox();
    show(index);
    lightbox.classList.add("is-open");
    document.body.style.overflow = "hidden";
    lightbox.querySelector(".lightbox__btn--close").focus();
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("is-open");
    document.body.style.overflow = "";
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  document.addEventListener("keydown", function (event) {
    if (!lightbox || !lightbox.classList.contains("is-open")) return;
    if (event.key === "Escape") closeLightbox();
    else if (event.key === "ArrowRight") step(1);
    else if (event.key === "ArrowLeft") step(-1);
  });

  /* ------------------------------------------------------------------ pages */

  function emptyState(heading, message) {
    var box = el("div", "empty-state");
    box.appendChild(el("h2", null, heading));
    box.appendChild(el("p", null, message));
    return box;
  }

  function renderAbout() {
    var mount = document.querySelector("[data-about]");
    if (!mount) return;

    var about = SITE.about || {};

    if (about.portrait) {
      mount.classList.add("has-portrait");
      var portrait = el("img", "portrait");
      portrait.src = encodePath(about.portrait);
      portrait.alt = SITE.name ? "Portrait of " + SITE.name : "Portrait";
      portrait.loading = "lazy";
      mount.appendChild(portrait);
    }

    var prose = el("div", "prose");
    (about.paragraphs || []).forEach(function (text) {
      prose.appendChild(el("p", null, text));
    });
    mount.appendChild(prose);
  }

  function field(name, label, type, rows) {
    var wrap = el("p", "field");

    var input = rows ? el("textarea") : el("input");
    input.id = "field-" + name;
    input.name = name;
    input.required = true;
    if (rows) input.rows = rows;
    else input.type = type || "text";

    var labelEl = el("label", null, label);
    labelEl.setAttribute("for", input.id);

    wrap.appendChild(labelEl);
    wrap.appendChild(input);
    return wrap;
  }

  function renderContact() {
    var mount = document.querySelector("[data-contact]");
    if (!mount) return;

    var contact = SITE.contact || {};

    if (contact.intro) {
      var intro = el("div", "prose");
      intro.appendChild(el("p", null, contact.intro));
      mount.appendChild(intro);
    }

    var form = el("form", "contact-form");
    form.noValidate = false;
    form.appendChild(field("name", "Name", "text"));
    form.appendChild(field("email", "Email", "email"));
    form.appendChild(field("message", "Description", null, 6));

    var submit = el("button", "button", "Send message");
    submit.type = "submit";
    form.appendChild(submit);

    var status = el("p", "form-status");
    status.setAttribute("role", "status");
    form.appendChild(status);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;

      var values = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        message: form.elements.message.value.trim()
      };

      if (contact.formEndpoint) {
        sendToEndpoint(contact.formEndpoint, values, form, status, submit);
      } else {
        sendViaMailClient(contact.email, values, status);
      }
    });

    mount.appendChild(form);

    if (contact.email) {
      var direct = el("p", "contact-direct");
      direct.appendChild(document.createTextNode("Or email me directly at "));
      var link = el("a", null, contact.email);
      link.href = "mailto:" + contact.email;
      direct.appendChild(link);
      direct.appendChild(document.createTextNode("."));
      mount.appendChild(direct);
    }
  }

  // No form service configured: hand the message off to the visitor's own
  // email app, pre-addressed and pre-filled.
  function sendViaMailClient(to, values, status) {
    var subject = "Portfolio enquiry from " + values.name;
    var body = values.message + "\n\n—\n" + values.name + "\n" + values.email;

    window.location.href =
      "mailto:" + to +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);

    status.className = "form-status is-ok";
    status.textContent =
      "Opening your email app — press send there to finish.";
  }

  function sendToEndpoint(endpoint, values, form, status, submit) {
    submit.disabled = true;
    status.className = "form-status";
    status.textContent = "Sending…";

    fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(values)
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Request failed");
        form.reset();
        status.className = "form-status is-ok";
        status.textContent = "Thanks — your message is on its way.";
      })
      .catch(function () {
        status.className = "form-status is-error";
        status.textContent =
          "Something went wrong. Please email me directly instead.";
      })
      .then(function () {
        submit.disabled = false;
      });
  }

  function playBadge() {
    var badge = el("span", "play-badge");
    badge.setAttribute("aria-hidden", "true");
    badge.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" focusable="false">' +
      '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
    return badge;
  }

  function videoMeta(card, video, note) {
    card.appendChild(el("h3", "video-card__title", video.title || "Untitled"));
    if (video.description) {
      card.appendChild(el("p", "video-card__description", video.description));
    }
    if (note) card.appendChild(el("p", "video-card__note", note));
  }

  // YouTube / Vimeo — plays inline on the page.
  function buildEmbedCard(video) {
    var card = el("article", "video-card");

    var frame = el("div", "video-card__frame");
    var iframe = document.createElement("iframe");
    iframe.src = video.embed;
    iframe.title = video.title || "Video";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";
    frame.appendChild(iframe);
    card.appendChild(frame);

    videoMeta(card, video);
    return card;
  }

  // Instagram reel — a self-hosted thumbnail that opens the reel on Instagram.
  // Instagram gives no way to read reels automatically, so the thumbnail is
  // supplied by hand in content/videos.js.
  function buildReelCard(video) {
    var card = el("article", "video-card video-card--reel");

    var link = el("a", "reel-link");
    link.href = video.reel;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute(
      "aria-label",
      "Watch “" + (video.title || "reel") + "” on Instagram (opens in a new tab)"
    );

    if (video.thumbnail) {
      var img = el("img", "reel-link__image");
      img.src = encodePath(video.thumbnail);
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", function () {
        img.remove();
        link.classList.add("is-missing-thumbnail");
      });
      link.appendChild(img);
    } else {
      link.classList.add("is-missing-thumbnail");
    }

    link.appendChild(el("span", "reel-link__scrim"));
    link.appendChild(playBadge());
    link.appendChild(el("span", "reel-link__cta", "Watch on Instagram"));

    card.appendChild(link);
    videoMeta(card, video);
    return card;
  }

  function videoGroup(heading, cards, modifier) {
    var wrapper = document.createDocumentFragment();
    if (heading) wrapper.appendChild(el("h2", "video-group__heading", heading));

    var grid = el("div", "video-grid" + (modifier ? " video-grid--" + modifier : ""));
    cards.forEach(function (card) { grid.appendChild(card); });
    wrapper.appendChild(grid);
    return wrapper;
  }

  function renderVideos() {
    var mount = document.querySelector("[data-videos]");
    if (!mount) return;

    // `hidden: true` keeps an entry in the file but off the page.
    var videos = (window.SITE_VIDEOS || []).filter(function (v) { return !v.hidden; });
    var reels = videos.filter(function (v) { return v.reel; });
    var films = videos.filter(function (v) { return !v.reel && v.embed; });

    if (!reels.length && !films.length) {
      mount.appendChild(
        emptyState(
          "Films are on the way",
          "Video work will live here. Add an entry to content/videos.js to publish one."
        )
      );
      return;
    }

    // Headings only earn their place when both kinds are on the page.
    var mixed = reels.length > 0 && films.length > 0;

    if (films.length) {
      mount.appendChild(videoGroup(mixed ? "Films" : null, films.map(buildEmbedCard)));
    }

    if (reels.length) {
      mount.appendChild(
        videoGroup(mixed ? "Reels" : null, reels.map(buildReelCard), "reels")
      );
    }
  }

  /* ------------------------------------------------------------------- init */

  function init() {
    applyIdentity();
    markCurrentNavLink();
    setupNavToggle();
    renderBanner();
    renderGallery();
    renderAbout();
    renderContact();
    renderVideos();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
