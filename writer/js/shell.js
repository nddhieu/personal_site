/* App shell (mobile-nav M1): the persistent primary navigation.
 *
 * Bottom tab bar on phone/tablet (<1024px), left rail on desktop
 * (>=1024px), following mobile-app-navigation-design.md §3.1 and
 * §6 slice 1. Five destinations: Explore, My Stories, + Create
 * (centre, raised), Saved, Profile. Labels always visible.
 *
 * Play/read screens show NO tab bar (design §3.1): play.html
 * simply never mounts the shell, so nothing here needs a special
 * case — renderShell no-ops when there is no #app-shell mount.
 *
 * Saved / Profile have no pages yet: those tabs render disabled
 * with a "Soon" badge and do not navigate, rather than linking
 * to a wrong destination. Explore -> home.html, My Stories ->
 * stories.html, Create -> create.html (existing pages).
 *
 * Same pattern as renderTopbar in app-ui.js: plain DOM, no
 * framework, constants only (no user data reaches innerHTML). */

const TABS = [
  {
    id: "explore",
    label: "Explore",
    href: "./home.html",
    icon: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  },
  {
    id: "my-stories",
    label: "My Stories",
    href: "./stories.html",
    icon: '<path d="M12 6.5C10 5 7.5 4.5 4 4.5v13.5c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4.5c-3.5 0-6 .5-8 2z"/><path d="M12 6.5v13.5"/>',
  },
  {
    id: "create",
    label: "Create",
    href: "./create.html",
    raised: true,
    icon: '<path d="M12 5v14M5 12h14"/>',
  },
  {
    id: "saved",
    label: "Saved",
    href: null, // M3 builds the page; disabled until then.
    icon: '<path d="M6 3.5h12V21l-6-4.5L6 21z"/>',
  },
  {
    id: "profile",
    label: "Profile",
    href: null, // M3 builds the page; disabled until then.
    icon: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c1.5-4 4.5-5.5 7.5-5.5s6 1.5 7.5 5.5"/>',
  },
];

function svgIcon(paths) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  // innerHTML is safe here: every icon path is a constant above.
  svg.innerHTML = paths;
  return svg;
}

function buildTab(tab, activeId) {
  const item = document.createElement(tab.href ? "a" : "span");
  item.className = "app-shell-tab";
  if (tab.raised) item.classList.add("app-shell-tab-raised");
  if (tab.id === activeId) {
    item.classList.add("app-shell-tab-active");
    item.setAttribute("aria-current", "page");
  }
  if (tab.href) {
    item.href = tab.href;
  } else {
    item.classList.add("app-shell-tab-disabled");
    item.setAttribute("aria-disabled", "true");
    item.tabIndex = -1;
  }
  const icon = document.createElement("span");
  icon.className = "app-shell-icon";
  icon.append(svgIcon(tab.icon));
  item.append(icon);
  const label = document.createElement("span");
  label.className = "app-shell-label";
  label.textContent = tab.label;
  item.append(label);
  if (!tab.href) {
    const soon = document.createElement("span");
    soon.className = "app-shell-soon";
    soon.textContent = "Soon";
    item.append(soon);
  }
  return item;
}

/* Renders the shell into <nav id="app-shell"> and marks the
 * body's shell class so CSS can reserve room for the bar/rail
 * (content bottom padding on phone, left padding on desktop).
 * Call with { active: "explore" | "my-stories" | "create" } from
 * the page module, next to renderTopbar. No-ops when the page
 * has no mount. */
export function renderShell(options = {}) {
  const host = document.getElementById("app-shell");
  if (!host) return;
  host.innerHTML = "";
  host.className = "app-shell";
  document.body.classList.add("has-app-shell");
  const brand = document.createElement("a");
  brand.className = "app-shell-brand";
  brand.href = "./home.html";
  brand.textContent = "AI Storytelling Co-Author";
  host.append(brand);
  for (const tab of TABS) {
    host.append(buildTab(tab, options.active));
  }
}
