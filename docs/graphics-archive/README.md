# Graphics archive

Dated snapshots of `src/render.js` and `styles.css`, taken before a visual
redesign (first use: moving the board's look towards early-JRPG pixel style,
2026-09-24 onward), so an earlier look stays easy to open and compare against
without checking out an old git revision.

Each dated folder is self-contained: its own frozen `render.js` and
`styles.css`, plus an `index.html` that draws one sample board straight from
those two files (a small level text is parsed inline in the page's own
script, rather than also freezing `engine.js`, since the parsing format isn't
part of what's being archived). Open the folder's `index.html` directly, or
serve it locally: `python3 -m http.server <port> --bind 127.0.0.1` from
inside the dated folder.

To add a new snapshot before another redesign push: `mkdir docs/graphics-archive/<date>`,
copy in the current `src/render.js` and `styles.css`, and copy the previous
snapshot's `index.html` (its sample level and parser don't need to change
unless a new cell type needs showing).
