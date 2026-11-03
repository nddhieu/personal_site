# Tech News / Research Library — design notes

How professional tech/news sites present stories, and what this library adopted
in the 2026-11-02 redesign. Sources checked: The Verge, TechCrunch, Ars
Technica/Wired-style article pages (via their redesign and headline/lede
writing coverage), MIT News / research-blog article headers, Substack and
Medium article headers, Hacker News (as the text-only contrast), and the
team's own research artifact that Hieu liked
(`Tech Lead, Architect & Agile — Strategy, Problem-Finding & Problem-Solving
Research`, 28 Oct 2026).

## Patterns observed

1. **Kicker / eyebrow above the headline.** The Verge, TechCrunch, and
   research blogs all put a short section label (uppercase, small, coloured)
   above the headline so a reader knows the beat before reading a word.
   Adopted: the article's `kicker` stays as the eyebrow on cards and in the
   detail header, next to a category chip.
2. **Headline + deck, not headline alone.** News pages pair a headline with
   a deck: one or two sentences stating the payoff. The deck is what makes a
   reader click. Adopted: every card now leads with a `hook` — one punchy
   line (≤18 words) stating the stakes or payoff — while the fuller
   `summary` moves into the detail view as the lede.
3. **Lede answers why it matters, fast.** Good ledes are 25–40 words and
   carry the main point plus the reason to care (the inverted-pyramid
   tradition). Adopted: the detail view opens with the summary as a lede,
   then immediately answers "why it matters" — see pattern 5.
4. **Hero image treatment: big, one consistent ratio.** The Verge's
   launch lesson (Nieman Lab) was big, consistent art on every story so the
   page flows. Adopted: all card images share one ratio (16:10), and the
   featured story gets a larger split hero card (image left, copy right).
5. **Benefit before the backstory.** Converting hero sections state the
   outcome first, then the how (headline = outcome, supporting line = how or
   proof). Adopted: the detail view puts a "Why it matters · What you get"
   benefit callout BEFORE the Problem section. The Benefit section is not
   repeated later in the numbered sections.
6. **Key-takeaways box for skimmers.** Explainers and research blogs
   increasingly front-load a short takeaways list so a reader gets the gist
   in 20 seconds. Adopted: a "Key takeaways" box with exactly 3 bullets per
   article, derived from the article's own facts, placed between the benefit
   callout and the stats row.
7. **Stat callouts, not stat soup.** Numbers land harder as big-number /
   small-label callout tiles (the sample artifact's "5–15%", "18.75%"
   tiles). Already present; kept and restyled consistently: the stats row
   now sits after the takeaways box, before the numbered sections.
8. **Numbered, eyebrowed sections.** The sample artifact numbers its
   sections (01, 1.1, 1.2…) so a long piece stays navigable. Adopted:
   detail sections are numbered 01 Problem, 02 Solution, 03 How to apply,
   with extra sections continuing the numbering.
9. **Meta line: date + read time.** Article headers everywhere show
   date and an estimated read time so readers can judge the commitment.
   Adopted: read time is computed in JS from the article's word count
   (~200 words/minute, minimum 1 minute) and shown on cards and in the
   detail header. No read-time data is stored in the JSON.
10. **Hero-plus-grid homepage.** The standard news-homepage pattern
    (NYT, Washington Post, Guardian, and the McClatchy design system):
    one large featured story, then a grid of the rest. Adopted: the newest
    article is the featured lead card above the grid.
11. **Hacker News contrast — deliberately NOT adopted.** Hacker News
    proves text-only headlines can work, but only with a community and a
    comment culture behind them. A standalone library with no comments
    needs the visual and summary layers above; a bare headline list would
    undersell every article.
12. **Pull quotes and "continue reading" rails — not adopted (yet).**
    Both need either quotable source lines (we write explainers, not
    interviews) or a larger catalogue to recommend from. Revisit when the
    library passes ~20 articles; a "More in this category" rail is the
    natural next step.

## Featured-card / filter behaviour (decision, 2026-11-02)

The featured card shows only under the "All" filter. Under a category
filter it hides, and the grid shows that category's cards — including the
featured article when it matches the category. Rationale: nothing is ever
hidden from a filter, and the featured story is never duplicated on screen
under "All".

## Facts-only rule for hooks and takeaways

Hooks and takeaways are rewrites of the article's existing summary, stats,
and detail sections — never new information. No number, price, date, or
claim appears in a hook or takeaway unless it already appears in that
article's content. When a hook needed a number, it reused the article's own
stat (e.g. 48.8 tok/s, 19.67%, $600–$2,500).

## Card type scale — Feed-template pass (2026-11-02)

Per Hieu's direction ("make the font smaller, make it similar this
template", with screenshots of the Muse Feed app), grid cards now follow
the Feed card: smaller semibold title (~17px), muted ~14.5px hook at 1.45
line height (clamped to 3 lines), ~11px kicker, a quiet ~12.5px
date · read-time footer with no divider, text above an inset 16:10 image
with 14px radius, tighter padding/gaps, and a flat hover (small shadow,
no lift or glow). The featured card keeps its image-left split layout on
the same scale (title capped at ~20px). Detail overlay structure is
unchanged; only its lede/benefit text came down one notch to ~16px.
