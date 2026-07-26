# Mobile Responsiveness Plan

## Overview

The portfolio site has **partial** responsive support (media queries at 1024px, 768px, 480px) but needs refinement. The writer app has **no** responsive support at all — this is the primary pain point on phones.

---

## Part 1: Main Portfolio Site (`style.css`)

### Issues Found

| Issue | Location | Lines |
|-------|----------|-------|
| Section padding (100px) too large on mobile | All sections | 551-553 |
| Hero title 3.5rem too large on small screens | `.hero-title` | 386-389 |
| Profile card doesn't shrink enough on small screens | `.profile-art` | 502-506 |
| Container padding (2rem) could be tighter on phones | `.container` | 115-120 |
| Project cards grid min 350px causes overflow at mid-sizes | `.projects-grid` | 695-699 |
| Timeline works on mobile but spacing could be tighter | `.timeline` | 797-881 |
| Contact info/form could use better mobile spacing | `.contact-grid` | 889-894 |
| Skills tags don't wrap elegantly on very small screens | `.skills-grid` | 645-649 |
| Missing `@media (max-width: 360px)` for very small phones | N/A | N/A |

### Changes Required

#### A. Improve existing 480px breakpoint (line 1196)
- Reduce section padding from 100px to 60px
- Reduce hero title from 2.5rem to 2rem
- Reduce section title from 2.5rem to 1.8rem
- Reduce container padding from 2rem to 1.25rem
- Reduce profile art from 180px to 140px
- Make skills tags smaller font

#### B. Add new 360px breakpoint for very small phones
- Further reduce hero title to 1.7rem
- Further reduce container padding to 1rem
- Make profile art 120px
- Stack hero CTA buttons always (already done at 480px)

---

## Part 2: Writer App (`writer/style.css`) — Major Work

### Issues Found

| Issue | Location | Lines |
|-------|----------|-------|
| **No media queries exist at all** | Entire file | 1-1118 |
| Header items overflow on mobile (story selector, buttons, badges) | `.header-right` | 94-98 |
| Workspace grid `3fr 2fr` won't fit on phone | `.workspace` | 182-187 |
| Narrative padding 24px 40px is too wide | `.narrative-display` | 220-229 |
| Story selector min-width 200px too wide for header | `.story-selector-container select` | 100-112 |
| Header title + controls don't wrap | `.app-header` | 64-73 |
| Form rows with columns don't stack | `.form-group.row` | 689-692 |
| Modal box max-width 600px with no mobile rule | `.modal-box` | 635-644 |
| Tab buttons text too long for phone widths | `.tab-btn` | 439-463 |
| Bible tabs don't wrap/scroll | `.bible-tabs` | 433-437 |
| Input area textarea + button layout breaks on small screens | `.prompt-form` | 383-418 |
| Auth container padding could be tighter | `.auth-container` | 881-886 |

### Changes Required

#### A. Add 1024px breakpoint (tablets)
- Reduce narrative padding from 40px to 24px sides
- Keep workspace grid but reduce right pane proportion

#### B. Add 768px breakpoint (small tablets / large phones)
- Stack workspace vertically: `grid-template-columns: 1fr`
- Make reading room height 60vh, story bible 40vh (with overflow scroll)
- Reduce narrative padding to 16px sides
- Wrap header items: allow `.header-right` to wrap or move some controls
- Reduce story selector min-width or make it responsive
- Make modal box max-width 90vw

#### C. Add 480px breakpoint (phones)
- Stack header: put title on one row, controls on next row
- Make header height auto/expandable
- Reduce font sizes in header
- Stack the form row columns (`.form-group.row` to `flex-direction: column`)
- Reduce bible tab button font size / padding
- Make the input area prompt form stack vertically (textarea above button)
- Reduce auth container padding
- Ensure auth-title font size reduces
- Fix the prompt form send button (circle might be too small)
- Reduce bible card padding

---

## Implementation Order

1. **`style.css`** — Update existing media queries and add new ones (quicker wins)
2. **`writer/style.css`** — Add full responsive support (the bulk of the work)

## Files to Modify

- [`style.css`](../style.css) — Main portfolio CSS (lines 1112-1215)
- [`writer/style.css`](../writer/style.css) — Writer app CSS (no responsive rules yet)

## Not Modified

- No HTML/JS changes needed — viewport meta tags already present in both [`index.html`](../index.html:5) and [`writer/index.html`](../writer/index.html:6)
- No structural markup changes required; all responsive work done via CSS
