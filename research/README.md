# Tech News / Research Library page

Public research library for Hieu's personal website, served by GitHub Pages at
`/personal_site/research/` from this folder.

## Files

- `index.html` — page shell (header/nav mirror the home page)
- `research.css` — card, filter, and article-detail styles, layered on
  `../style.css` theme variables
- `research.js` — theme/menu handling, card rendering, category filters, and
  the full article explainer view
- `research-data.json` — the article library (newest first)
- `img/` — one illustrative image per article, compressed to max 1200px wide
  JPEG

## Adding a new article

The page is a static snapshot — GitHub Pages has no live connection to the
team's research files. To publish another research finding:

1. Append a new object to the `articles` array in `research-data.json`, keeping
   the array newest first. Use this shape:

   ```json
   {
     "slug": "short-url-safe-name",
     "date": "YYYY-MM-DD",
     "category": "Tools",
     "kicker": "Short framing line",
     "title": "Article title",
     "summary": "Two or three sentences shown on the card.",
     "image": "img/short-url-safe-name.jpg",
     "problem": "The problem statement.",
     "solution": "The proposed or discovered solution.",
     "benefit": "Why it matters.",
     "apply": "How our team or the reader can apply it.",
     "source_name": "Source name",
     "source_url": "https://example.com/source"
   }
   ```

   Categories used by the filters are `Tools`, `Models`, and `Opportunities`.
   If an article has no public source URL, set `source_url` to an empty string;
   the page will show the source name without a link.

2. Add one illustrative image with the same slug at
   `img/<slug>.jpg` (max width 1200, JPEG quality around 78).
3. Validate `research-data.json` as JSON and check `research.js` syntax.
4. Commit and push to `main`; GitHub Pages redeploys automatically.

Asking Chubby to "add this research to Tech News" runs exactly this flow.
