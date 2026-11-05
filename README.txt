World Overcomers — Watch Live (standalone player)

No Perchance, no plugins, no build step. Open watch-live.html in a browser or host it anywhere.

To go live: open watch-live.html in a text editor, find the CONFIG block at the top of the <script>, and set:
  channel:   your YouTube channel, e.g. "@twocorg"
  youtubeId: the live video id or watch/live link, e.g. "FwlwESUwecA"
             (or "" for channel waiting mode)

Behavior: verifies the id (noembed -> oEmbed), autoplays muted (browser policy),
first click/keypress anywhere (or clicking the picture) brings sound. Cover lifts
only while actually PLAYING; dead ids land on thumbnail + repair; if the network
blocks YouTube video data it says so instead of spinning.
