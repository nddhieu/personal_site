/* Avatar library: the reader's pickable identities.
 *
 * One consistent house style: a flat geometric glyph (simple
 * circles/paths, 2-4 colors) centred on a two-stop gradient disc,
 * drawn on a 48x48 viewBox so it reads at 24px (list rows) and
 * 96px (profile header) alike. No photos, no emoji, no external
 * images — every avatar is inline SVG defined here.
 *
 * SINGLE SOURCE OF TRUTH for the frontend. The backend keeps its
 * own copy of just the ids in app/avatars.py (story-realm repo)
 * for validation; the ids there must match AVATARS here exactly.
 * users.avatar_id stores the pick; null/unset (or an unknown id,
 * e.g. from a newer client) falls back to DEFAULT_AVATAR_ID.
 *
 * SEAM for the reading view: Milu's play-screen attribution rows
 * import { avatarNode, avatarHTML, getAvatar } from here for the
 * player's "You" rows — this module is the only place avatar art
 * is defined, so a pick made on the Profile page shows up there
 * unchanged.
 *
 * Rendering contract: .avatar-disc is a round, overflow-hidden
 * span; the svg fills it edge to edge (the gradient rect is the
 * disc). Pair with the size classes in profile.css (.avatar-sm
 * 24px, .avatar-md 48px, .avatar-lg 96px) or your own dimensions —
 * only width/height on .avatar-disc matter. */

export const DEFAULT_AVATAR_ID = "wanderer";

function svgWrap(id, gradient, glyph) {
  return (
    '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
    "<defs>" +
    '<linearGradient id="avg-' + id + '" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + gradient[0] + '"/>' +
    '<stop offset="1" stop-color="' + gradient[1] + '"/>' +
    "</linearGradient>" +
    "</defs>" +
    '<rect width="48" height="48" fill="url(#avg-' + id + ')"/>' +
    glyph +
    "</svg>"
  );
}

export const AVATARS = [
  {
    id: "wanderer",
    label: "Wanderer",
    svg: svgWrap("wanderer", ["#64748b", "#1e293b"],
      '<path d="M24 7C15 7 10.5 14 10.5 22h4.5c0-5.5 4-9.5 9-9.5s9 4 9 9.5h4.5C37.5 14 33 7 24 7Z" fill="#e8dcc3"/>' +
      '<circle cx="24" cy="22" r="6" fill="#3a2c20"/>' +
      '<circle cx="21.6" cy="22" r="1" fill="#f5c97b"/>' +
      '<circle cx="26.4" cy="22" r="1" fill="#f5c97b"/>' +
      '<path d="M8 48c1-10 7-15 16-15s15 5 16 15Z" fill="#7c5a38"/>' +
      '<circle cx="24" cy="38" r="1.8" fill="#f5c97b"/>'),
  },
  {
    id: "knight",
    label: "Knight",
    svg: svgWrap("knight", ["#b8c4d4", "#5b6b82"],
      '<path d="M24 9c0-4 4-6 7-5-2 2-2 4-1 6-3-1-5-1-6-1Z" fill="#dc2626"/>' +
      '<path d="M12 30V22c0-8 5-13 12-13s12 5 12 13v8h-5v-6H17v6Z" fill="#e5e9f0"/>' +
      '<rect x="20" y="19" width="8" height="2.4" rx="1.2" fill="#334155"/>' +
      '<circle cx="21" cy="27" r="0.9" fill="#334155"/>' +
      '<circle cx="24" cy="27" r="0.9" fill="#334155"/>' +
      '<circle cx="27" cy="27" r="0.9" fill="#334155"/>' +
      '<rect x="15" y="33" width="18" height="3" rx="1.5" fill="#94a3b8"/>'),
  },
  {
    id: "sorceress",
    label: "Sorceress",
    svg: svgWrap("sorceress", ["#7c5cbf", "#3b2168"],
      '<path fill-rule="evenodd" fill="#f7ead9" d="M9 24a15 15 0 1 0 30 0a15 15 0 1 0-30 0Zm9.5 0a11.5 11.5 0 1 0 23 0a11.5 11.5 0 1 0-23 0Z"/>' +
      '<path d="M34 8l1.6 4.4L40 14l-4.4 1.6L34 20l-1.6-4.4L28 14l4.4-1.6Z" fill="#ffd166"/>' +
      '<path d="M29 27l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="#ffd166" opacity="0.85"/>'),
  },
  {
    id: "rogue",
    label: "Rogue",
    svg: svgWrap("rogue", ["#57534e", "#1c1917"],
      '<circle cx="24" cy="20" r="13" fill="#292524"/>' +
      '<path d="M8 48c1.5-8 7.5-12 16-12s14.5 4 16 12Z" fill="#292524"/>' +
      '<circle cx="24" cy="21" r="8.5" fill="#0c0a09"/>' +
      '<ellipse cx="20" cy="20.5" rx="2.1" ry="1.2" fill="#fbbf24"/>' +
      '<ellipse cx="28" cy="20.5" rx="2.1" ry="1.2" fill="#fbbf24"/>'),
  },
  {
    id: "bard",
    label: "Bard",
    svg: svgWrap("bard", ["#d97706", "#7c2d12"],
      '<path d="M31 12c3-6 8-8 11-7-1 5-4 9-9 11-.8-1.8-1.4-3-2-4Z" fill="#16a34a"/>' +
      '<path d="M15 20c0-8 4-11 9-11s9 3 9 11Z" fill="#92400e"/>' +
      '<ellipse cx="24" cy="20.5" rx="13" ry="3.4" fill="#78350f"/>' +
      '<path d="M19.4 37.5v-12l13-2.6v12" fill="none" stroke="#fef3c7" stroke-width="2.2"/>' +
      '<path d="M19.4 25.5l13-2.6v3.6l-13 2.6Z" fill="#fef3c7"/>' +
      '<ellipse cx="16.2" cy="37.5" rx="3.4" ry="2.6" fill="#fef3c7"/>' +
      '<ellipse cx="29.2" cy="34.9" rx="3.4" ry="2.6" fill="#fef3c7"/>'),
  },
  {
    id: "alchemist",
    label: "Alchemist",
    svg: svgWrap("alchemist", ["#0d9488", "#134e4a"],
      '<rect x="20.5" y="6.5" width="7" height="3" rx="1" fill="#b45309"/>' +
      '<path d="M21 9.5h6V18l7 15c1.5 3-.5 6-4 6H18c-3.5 0-5.5-3-4-6l7-15Z" fill="#99f6e4" opacity="0.92"/>' +
      '<path d="M17.3 30h13.4l2.4 5c.8 1.8-.7 3-3.1 3H18c-2.4 0-3.9-1.2-3.1-3Z" fill="#14b8a6"/>' +
      '<circle cx="22" cy="33.5" r="1.3" fill="#f0fdfa"/>' +
      '<circle cx="27" cy="35" r="1" fill="#f0fdfa"/>' +
      '<circle cx="25" cy="24" r="1.1" fill="#f0fdfa" opacity="0.8"/>'),
  },
  {
    id: "captain",
    label: "Captain",
    svg: svgWrap("captain", ["#0369a1", "#082f49"],
      '<path d="M8 21c6-9 11-12 16-12s10 3 16 12c-6-2.5-11-3.5-16-3.5S14 18.5 8 21Z" fill="#1f2937"/>' +
      '<rect x="8" y="20" width="32" height="2.6" fill="#f59e0b"/>' +
      '<circle cx="24" cy="27" r="6" fill="#f2c094"/>' +
      '<circle cx="21.8" cy="26" r="1" fill="#1f2937"/>' +
      '<circle cx="26.2" cy="26" r="1" fill="#1f2937"/>' +
      '<path d="M18 27c0 7 2.5 11 6 11s6-4 6-11c-2 3-4 4-6 4s-4-1-6-4Z" fill="#e5e7eb"/>'),
  },
  {
    id: "ranger",
    label: "Ranger",
    svg: svgWrap("ranger", ["#16a34a", "#14532d"],
      '<path d="M33 7c4.5 0 7 2.5 7 7-4.5 0-7-2.5-7-7Z" fill="#a3e635"/>' +
      '<path d="M17 8c-6 8-6 24 0 32" fill="none" stroke="#92400e" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M17 8v32" stroke="#f7ead9" stroke-width="1.2"/>' +
      '<path d="M13 24h21" stroke="#f7ead9" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M34 24l-6-3.5L29.5 24 28 27.5Z" fill="#f7ead9"/>' +
      '<path d="M13 24l-3-2v4Z" fill="#f7ead9"/>'),
  },
  {
    id: "oracle",
    label: "Oracle",
    svg: svgWrap("oracle", ["#eab308", "#854d0e"],
      '<path d="M13 26V24c0-9 5-15 11-15s11 6 11 15v2h-2.5c0-7-3.5-13.5-8.5-13.5S15.5 17 15.5 26Z" fill="#a16207"/>' +
      '<ellipse cx="24" cy="25" rx="8.5" ry="10.5" fill="#f7ead9"/>' +
      '<path d="M24 10.5 28 15l-4 4.5L20 15Z" fill="#e879f9" stroke="#701a75"/>' +
      '<path d="M17.2 24c1.4 1.4 3.4 1.4 4.8 0M26 24c1.4 1.4 3.4 1.4 4.8 0" fill="none" stroke="#7c2d12" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M22 31c1 1 3 1 4 0" fill="none" stroke="#7c2d12" stroke-width="1.6" stroke-linecap="round"/>'),
  },
  {
    id: "android",
    label: "Android",
    svg: svgWrap("android", ["#06b6d4", "#164e63"],
      '<path d="M24 14V8.5" stroke="#e0f7fa" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="24" cy="6.8" r="2.4" fill="#f472b6"/>' +
      '<rect x="8.5" y="20" width="3.5" height="6" rx="1.7" fill="#a5f3fc"/>' +
      '<rect x="36" y="20" width="3.5" height="6" rx="1.7" fill="#a5f3fc"/>' +
      '<rect x="12" y="13" width="24" height="20" rx="5" fill="#e0f7fa"/>' +
      '<circle cx="18.5" cy="21.5" r="2.6" fill="#0891b2"/>' +
      '<circle cx="29.5" cy="21.5" r="2.6" fill="#0891b2"/>' +
      '<rect x="19" y="27.5" width="10" height="2.2" rx="1.1" fill="#0891b2"/>' +
      '<rect x="19" y="35" width="10" height="3" rx="1.5" fill="#a5f3fc"/>'),
  },
  {
    id: "fox",
    label: "Fox",
    svg: svgWrap("fox", ["#f97316", "#9a3412"],
      '<path d="M12 25 10 8l12 7Z" fill="#c2410c"/>' +
      '<path d="m36 25 2-17-12 7Z" fill="#c2410c"/>' +
      '<path d="M13.6 20.5 12.8 12l6.4 4.2Z" fill="#ffedd5"/>' +
      '<path d="m34.4 20.5.8-8.5-6.4 4.2Z" fill="#ffedd5"/>' +
      '<path d="M24 13c7 0 12 5 12 12 0 8-6 14-12 16C18 39 12 33 12 25c0-7 5-12 12-12Z" fill="#f97316"/>' +
      '<path d="M17 30c2-3 4.5-4 7-4s5 1 7 4c-1.5 5-4 7.5-7 8.5-3-1-5.5-3.5-7-8.5Z" fill="#fff7ed"/>' +
      '<path d="M21.5 30.8h5L24 34.3Z" fill="#431407"/>' +
      '<ellipse cx="18.3" cy="22" rx="1.7" ry="2.2" fill="#431407"/>' +
      '<ellipse cx="29.7" cy="22" rx="1.7" ry="2.2" fill="#431407"/>'),
  },
  {
    id: "dragon",
    label: "Dragon",
    svg: svgWrap("dragon", ["#dc2626", "#7f1d1d"],
      '<path d="M15 17 11 6l9 5.5Z" fill="#fbbf24"/>' +
      '<path d="m33 17 4-11-9 5.5Z" fill="#fbbf24"/>' +
      '<path d="M24 10c7 0 11 5 11 12v5c0 4-2 6-5 7l-1 5-5-3-5 3-1-5c-3-1-5-3-5-7v-5c0-7 4-12 11-12Z" fill="#991b1b"/>' +
      '<path d="M15.2 19.5l6.3 1.5M32.8 19.5 26.5 21" stroke="#450a0a" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M16.8 22.2l4.4 1.2-4.4 1.2ZM31.2 22.2l-4.4 1.2 4.4 1.2Z" fill="#fbbf24"/>' +
      '<circle cx="21" cy="30" r="1.1" fill="#450a0a"/>' +
      '<circle cx="27" cy="30" r="1.1" fill="#450a0a"/>'),
  },
];

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

/* The avatar for an id, or the default when the id is null,
 * empty, or not in the library. */
export function getAvatar(id) {
  return BY_ID.get(id) || BY_ID.get(DEFAULT_AVATAR_ID);
}

/* Just the svg string for an id (default on unknown). */
export function avatarSVG(id) {
  return getAvatar(id).svg;
}

/* Round-avatar markup as a string, for innerHTML contexts.
 * sizeClass is a sizing class for .avatar-disc (see header). */
export function avatarHTML(id, sizeClass = "") {
  const avatar = getAvatar(id);
  return (
    '<span class="avatar-disc ' + sizeClass + '" role="img" aria-label="' +
    avatar.label + '">' + avatar.svg + "</span>"
  );
}

/* Round-avatar element, for DOM-building contexts. Same markup
 * as avatarHTML, returned as a node. */
export function avatarNode(id, sizeClass = "") {
  const avatar = getAvatar(id);
  const span = document.createElement("span");
  span.className = "avatar-disc" + (sizeClass ? " " + sizeClass : "");
  span.setAttribute("role", "img");
  span.setAttribute("aria-label", avatar.label);
  // innerHTML is safe here: the svg is a constant from AVATARS.
  span.innerHTML = avatar.svg;
  return span;
}
