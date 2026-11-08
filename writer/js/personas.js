/* Persona portrait library: the faces a reader can give
 * their persona (the character THEY play - Emochi's Persona).
 *
 * SINGLE SOURCE OF TRUTH for the frontend. The backend keeps
 * its own copy of just the ids in app/personas.py (story-realm
 * repo) for validation; the ids there must match
 * PERSONA_IMAGES here exactly, in the same order.
 * personas.image_id stores the pick.
 *
 * The portraits are hosted photos in writer/personas/<id>.jpg
 * (600x800, face in the upper half so the round avatar crops
 * and the persona page's showcase both read well). They were
 * art-directed to HOOK (Hieu, Nov 8): magnetic lead energy -
 * direct engagement or a charged candid moment, beauty-shot
 * craft, and a slice of story in the frame (rainy window,
 * penthouse night, lamp-lit room), never a neutral passport
 * stare. Photographic, matching the app's scene / character
 * art; no text; adults only.
 *
 * The set was regenerated IDOL-TIER (Hieu, Nov 8): every face
 * is a star at their peak, because readers want the best
 * version of who they will be in the story.
 *
 * Portraits carry NO age or gender captions (Hieu, Nov 8):
 * a persona's age is whatever the reader enters in the form,
 * and the photos speak for themselves; the library must not
 * label or steer either. Gender stays as data because picking
 * a portrait proposes the form's gender on create.
 *
 * A persona can also carry the reader's OWN uploaded photo
 * (persona.has_custom_image, set by POST
 * /api/personas/{id}/image). The photo is served owner-only,
 * so surfaces resolve it through personaImageURL below -
 * the single resolver every persona face goes through. */

import { apiFetch } from "./app-api.js";

export const PERSONA_IMAGES = [
  { id: "m1", gender: "male", src: "./personas/m1.jpg" },
  { id: "m2", gender: "male", src: "./personas/m2.jpg" },
  { id: "m3", gender: "male", src: "./personas/m3.jpg" },
  { id: "m4", gender: "male", src: "./personas/m4.jpg" },
  { id: "m5", gender: "male", src: "./personas/m5.jpg" },
  { id: "m6", gender: "male", src: "./personas/m6.jpg" },
  { id: "f1", gender: "female", src: "./personas/f1.jpg" },
  { id: "f2", gender: "female", src: "./personas/f2.jpg" },
  { id: "f3", gender: "female", src: "./personas/f3.jpg" },
  { id: "f4", gender: "female", src: "./personas/f4.jpg" },
  { id: "f5", gender: "female", src: "./personas/f5.jpg" },
  { id: "f6", gender: "female", src: "./personas/f6.jpg" },
];

const BY_ID = new Map(PERSONA_IMAGES.map((img) => [img.id, img]));

/* The library entry for an id, or null for anything unknown
 * (a stored pick from a newer client must never crash a
 * page - callers fall back to a name-only rendering). */
export function getPersonaImage(id) {
  return BY_ID.get(id) || null;
}

/* The hosted photo URL for an id, or "" when unknown. */
export function personaImageSrc(id) {
  const img = getPersonaImage(id);
  return img ? img.src : "";
}

/* ── Effective persona image ───────────────────────────────
 * Custom photo first, library portrait as the fallback: when
 * there is no upload, or its fetch fails, the library src is
 * what renders - a surface must never show a broken image.
 * Object URLs are cached per persona id for the page
 * session; invalidatePersonaImage drops one after a
 * re-upload or a switch back to the library. */
const customImageURLs = new Map();

export function personaHasCustomImage(persona) {
  return !!(persona && persona.has_custom_image);
}

export async function personaImageURL(persona) {
  if (personaHasCustomImage(persona)) {
    if (!customImageURLs.has(persona.id)) {
      customImageURLs.set(persona.id, (async () => {
        try {
          const blob = await apiFetch(
            "/api/personas/" + encodeURIComponent(persona.id) + "/image",
            { response: "blob" });
          return URL.createObjectURL(blob);
        } catch {
          return null;
        }
      })());
    }
    const url = await customImageURLs.get(persona.id);
    if (url) return url;
  }
  return personaImageSrc(persona && persona.image_id);
}

/* Paint a persona's face into an <img>: the library portrait
 * paints synchronously (so a render never waits on the
 * network), then the custom photo swaps in when its fetch
 * lands. Resolves to the URL finally painted ("" when the
 * persona has no usable image at all). */
export async function applyPersonaImage(img, persona) {
  if (!img || !persona) return "";
  const library = personaImageSrc(persona.image_id);
  if (library) img.src = library;
  const url = await personaImageURL(persona);
  if (url) img.src = url;
  return url;
}

export function invalidatePersonaImage(personaId) {
  const pending = customImageURLs.get(personaId);
  if (pending) {
    pending.then((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    customImageURLs.delete(personaId);
  }
}
