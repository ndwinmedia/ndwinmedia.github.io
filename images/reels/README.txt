Reel thumbnails live in this folder.

Most of the time you don't need to touch anything here. Running

    node tools/sync-reels.js

downloads a cover image for each of your recent reels automatically and names
it after the reel, e.g. DMNvxhhRSTC.jpg. Delete one and the next run fetches it
again.

TO ADD A REEL BY HAND (for older reels the sync can't reach):

  1. Save a still frame from the reel as a .jpg or .png and drop it here.
     Easiest way: play the reel and screenshot a frame you like.

  2. Add an entry in content/videos.js pointing at the file, e.g.
     thumbnail: "images/reels/wedding-teaser.jpg"

Vertical (portrait) images look best — the cards are shaped 9:16 like a reel.
Anything else will be cropped to fit, centred.
