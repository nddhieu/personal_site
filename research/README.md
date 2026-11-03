# Tech News / Research Library page

Public research library for Hieu's personal website, served by GitHub Pages at
`/personal_site/research/` from this folder.

## Files

- `index.html` — page shell (header/nav mirror the home page)
- `research.css` — card, filter, featured-story, and article-detail styles,
  layered on `../style.css` theme variables
- `research.js` — theme/menu handling, card rendering, category filters,
  featured story, read-time computation, and the full article explainer view
- `research-data.json` — the article library (newest first)
- `DESIGN-NOTES.md` — the news-site design patterns behind the layout and
  which ones were adopted (see also the facts-only rule for hooks/takeaways)
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
     "summary": "Two or three sentences shown as the lede in the detail view.",
     "hook": "One punchy line (max ~18 words) shown on the card — the stakes or payoff, rewritten from the article's own facts only, never a new claim or number.",
     "takeaways": ["Three short bullets for the Key takeaways box, facts-only from the article's own content."],
     "image": "img/short-url-safe-name.jpg",
     "problem": "The problem statement.",
     "solution": "The proposed or discovered solution.",
     "benefit": "Why it matters.",
     "apply": "How our team or the reader can apply it.",
     "stats": [
       { "value": "19.67%", "label": "What this number measures" }
     ],
     "details": [
       { "heading": "How it works", "body": "A deeper explanation section." }
     ],
     "checklist": ["First concrete step a reader can take.", "Second concrete step."],
     "caveats": "What is unverified, vendor-claimed, or still an open question.",
     "source_name": "Source name",
     "source_url": "https://example.com/source"
   }
   ```

   Categories used by the filters are `Tools`, `Models`, and `Opportunities`.
   If an article has no public source URL, set `source_url` to an empty string;
   the page will show the source name without a link.

   Three optional fields make the explainer richer, in the style of the team's
   research artifacts:

   - `stats` — up to 4 headline numbers, each `{ "value", "label" }`. They
     render as a stat row under the article's lede in the detail view (big
     number, small label), and the first stat also appears on the card. Only
     use numbers that are actually in the research notes — never invent a
     benchmark, price, or date to fill the row. Omit the field (or use an
     empty array) when an article has no real numbers.
   - `details` — 5–7 extra explanation sections, each `{ "heading", "body" }`,
     rendered after "How to apply". They are freeform: give each article the
     sections its topic actually needs — background, how it works, a
     comparison against the alternatives in the research record, trade-offs,
     what to watch next, or a worked example built from the article's own
     facts. Core sections (benefit, Problem, Solution, How to apply) are only
     part of the content, not a template the extras must mirror.
   - `checklist` — 4–5 short, concrete first-step items, rendered as a
     "First steps — a checklist" box after the detail sections and before
     the caveats. Derive them from the article's own "How to apply" text and
     the research first-step notes; no new claims or numbers.
   - `caveats` — one short paragraph rendered in a distinct "What we could not
     verify — open questions" box before the source line. Say plainly what is
     vendor-claimed, single-sourced, or still untested by the team.

2. Add one illustrative image with the same slug at
   `img/<slug>.jpg` (max width 1200, JPEG quality around 78).
3. Validate `research-data.json` as JSON and check `research.js` syntax.
   Every article must have a `hook` (≤ ~18 words) and exactly 3
   `takeaways`, and should carry 5–7 `details` sections plus a 4–5 item
   `checklist`; the newest article automatically becomes the featured lead
   card (shown only under the "All" filter — see `DESIGN-NOTES.md`).
   Read time is computed by the page from word count, not stored.
4. Commit and push to `main`; GitHub Pages redeploys automatically.

Asking Chubby to "add this research to Tech News" runs exactly this flow.
