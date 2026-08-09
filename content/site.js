/* ============================================================================
   SITE-WIDE SETTINGS
   ----------------------------------------------------------------------------
   Name, tagline, banner, bio, and contact details all live here so they can be
   changed in one place without touching any HTML.
   ========================================================================== */

window.SITE = {
  /* --- Identity ---------------------------------------------------------- */
  name: "Andy Nguyen",
  // Shown under the name on the home page banner.
  tagline: "Photography",
  // Small line of context under the tagline. Keep it short.
  subtitle: "A storyteller at heart",

  /* --- Home page banner -------------------------------------------------- */
  banner: "images/banner/image.png",

  /* --- Instagram --------------------------------------------------------- */
  // Username only, no @ and no link. Used by `node tools/sync-reels.js`,
  // which pulls your latest reels onto the Video page.
  instagram: "ndwinmedia",

  /* --- About page -------------------------------------------------------- */
  about: {
    heading: "About me",
    // Each string below becomes its own paragraph.
    paragraphs: [
      "I'm a photographer, videographer, and storyteller drawn to the moments that make a story feel alive—the quiet details, fleeting expressions, and little in-between moments.",
      "I capture people as they are, turning those moments into something you can look back on and feel all over again."
    ],
    // Optional portrait. Set to null to hide it.
    portrait: "images/About Me/image.png"
  },

  /* --- Contact ----------------------------------------------------------- */
  contact: {
    intro: "Tell me a little about what you have in mind.",

    // Where messages are sent.
    email: "an.nguyen0410@gmail.com",

    /* HOW THE FORM SENDS MAIL
       As it stands, submitting opens the visitor's own email app with the
       message already filled in and addressed to you. That works everywhere
       with zero setup, but it does mean the visitor has to press send in their
       mail app — and it won't work for someone with no mail app configured.

       To have messages delivered straight to your inbox instead, sign up for a
       free form service (formspree.io or web3forms.com — takes a couple of
       minutes), then paste the endpoint they give you below. Nothing else
       needs to change. */
    formEndpoint: null // e.g. "https://formspree.io/f/xxxxxxxx"
  }
};
