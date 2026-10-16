import en from "./translations/en.json";
import pl from "./translations/pl.json";

/* UI texts, one JSON file per language. {name} placeholders are filled by
   format(); `blocks` has plural forms picked with Intl.PluralRules. A key or
   language missing here falls back to English. */
export const TRANSLATIONS = { en, pl };

/* "pl-PL" -> "pl"; languages without translations -> "en". */
export function pickLanguage(language) {
  const base = String(language || "").toLowerCase().split("-")[0];
  return TRANSLATIONS[base] ? base : "en";
}
export const format = (text, params = {}) => text.replace(/\{(\w+)\}/g, (m, k) => params[k] ?? m);
