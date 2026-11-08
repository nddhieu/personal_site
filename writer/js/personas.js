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
 * The ageLabel is the portrait's presentation age band for
 * the picker grid ("Male · 30s"); a persona's own age is a
 * number the reader enters and does not have to match it. */

export const PERSONA_IMAGES = [
  { id: "m1", gender: "male", ageLabel: "20s", src: "./personas/m1.jpg" },
  { id: "m2", gender: "male", ageLabel: "30s", src: "./personas/m2.jpg" },
  { id: "m3", gender: "male", ageLabel: "40s", src: "./personas/m3.jpg" },
  { id: "m4", gender: "male", ageLabel: "50s", src: "./personas/m4.jpg" },
  { id: "m5", gender: "male", ageLabel: "20s", src: "./personas/m5.jpg" },
  { id: "m6", gender: "male", ageLabel: "40s", src: "./personas/m6.jpg" },
  { id: "f1", gender: "female", ageLabel: "20s", src: "./personas/f1.jpg" },
  { id: "f2", gender: "female", ageLabel: "30s", src: "./personas/f2.jpg" },
  { id: "f3", gender: "female", ageLabel: "30s", src: "./personas/f3.jpg" },
  { id: "f4", gender: "female", ageLabel: "40s", src: "./personas/f4.jpg" },
  { id: "f5", gender: "female", ageLabel: "20s", src: "./personas/f5.jpg" },
  { id: "f6", gender: "female", ageLabel: "50s", src: "./personas/f6.jpg" },
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

/* "Male · 30s" for the picker grid and sheet rows. */
export function personaImageLabel(id) {
  const img = getPersonaImage(id);
  if (!img) return "";
  const gender = img.gender === "male" ? "Male" : "Female";
  return gender + " · " + img.ageLabel;
}
