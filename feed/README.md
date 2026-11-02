# The Feed page

Public page for Hieu's Muse Feed posts, served by GitHub Pages at
`/personal_site/feed/` from this folder.

## Files

- `index.html` — page shell (header/nav mirror the home page)
- `feed.css` — feed styles, layered on `../style.css` theme variables
- `feed.js` — theme/menu handling + rendering from the data file
- `feed-data.json` — the exported posts (newest day first)
- `img/` — hero images for posts, compressed to max 1200px wide JPEG

## Refreshing the posts

The page is a static snapshot — GitHub Pages has no live connection to the
Muse feed. To refresh:

1. Export the newest feed units into `feed-data.json` (same shape:
   `generated_at`, `days[]` with `date`, `label`, `posts[]` carrying
   `id`, `kicker`, `title`, `category`, `why`, `body` (markdown),
   `image`, `stats`).
2. Compress each new hero image into `img/` (max width 1200, JPEG q78).
3. Commit and push to `main`; GitHub Pages redeploys automatically.

Asking Chubby to "refresh the feed page" runs exactly this flow.
