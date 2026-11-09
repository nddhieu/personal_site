# E2E browser tests

Cucumber + Selenium (ChromeDriver) driving headless Chrome against
the real writer GUI and the real API. No screen or mouse is used;
the suite can run while the PC is in use.

## Run (on HieuPC, from this folder)

```
npm install        # once; Selenium Manager fetches the matching ChromeDriver
npm test           # @smoke: login -> guest -> library -> play screen loads
npm run test:full  # @full:  smoke + one real story turn + diary check
```

The suite drives the dev GUI on serverPC over the tailnet by default:
E2E_BASE_URL=http://100.66.24.109:4000/writer (override with
E2E_BASE_URL to point at a local GUI, e.g. http://localhost:4000/writer
when serving the writer folder locally). The GUI proxies the dev API
(serverPC :8002); the suite makes no direct API calls.

The @full scenario sends ONE real turn through the LLM pipeline,
so it takes minutes and uses the configured provider. Failures
save a screenshot under reports/ (git-ignored).

## Selectors

Steps target the current GUI: Explore cards are article.explore-card
with h2.card-title and a stretched a.explore-card-link to
play.html; the composer sends with [data-testid=send-btn]
(Enter makes a new line since Nov 5). If the GUI renames a control,
update the step, not the page, and re-run @smoke.

## Screenshot set (B9, #10e)

npm run test:screenshots walks Explore -> wizard -> play as a guest
and saves a named set under e2e/screenshots/ (committed as the proof
step for the frontend items):

- explore.png - library with the Accad and Kim card
- wizard.png - book-creation wizard, step 1
- play.png - play screen with the opening scene

The committed PNGs are the last verified capture against the live dev
GUI; re-run the tag to refresh them after a GUI change. Screenshots
on failure still land in reports/ (git-ignored) via the After hook
in features/support/hooks.js.
