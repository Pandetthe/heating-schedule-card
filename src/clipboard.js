/* Clipboard shared by every card on the page: copied blocks can be pasted into
   any day group of the same card or into another room's schedule. Like a regular
   clipboard it lasts until the next copy (or a page reload). */
export let clipboard = null;   // { schedule, name, label, days: [...], blocks: [...] }
export const cards = new Set();
export function setClipboard(value) {
  clipboard = value;
  for (const c of cards) c._render();
}
