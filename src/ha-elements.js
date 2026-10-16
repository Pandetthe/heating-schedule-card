/* Picks the first registered element from a list of preferences.
   The card uses native HA elements where they exist and falls back to a simpler
   variant on older/newer versions instead of breaking. */
export const firstDefined = (...names) => names.find((n) => customElements.get(n)) || null;

export function haButton(text, { primary = false, icon = null } = {}) {
  const tag = firstDefined("ha-button", "mwc-button");
  if (tag) {
    const el = document.createElement(tag);
    // Attributes for both element families are set - unknown ones are ignored,
    // so the button comes out filled whatever the HA frontend version.
    if (primary) {
      el.setAttribute("unelevated", "");        // mwc-button: filled
      el.setAttribute("raised", "");
      el.setAttribute("appearance", "filled");  // ha-button (Material 3)
      el.setAttribute("variant", "brand");
    } else {
      // Secondary actions in HA are "ghost" - flat, no outline.
      el.setAttribute("appearance", "plain");
      el.setAttribute("variant", "brand");
    }
    el.textContent = text;
    if (icon) {
      const i = document.createElement("ha-icon");
      i.setAttribute("icon", icon);
      i.slot = "icon";
      el.prepend(i);
    }
    return el;
  }
  const el = document.createElement("button");
  el.className = primary ? "fallback primary" : "fallback";
  el.textContent = text;
  return el;
}

export function haIconButton(icon, label) {
  const tag = firstDefined("ha-icon-button");
  if (tag) {
    const el = document.createElement(tag);
    // ha-icon-button shows the label as a tooltip itself, like everywhere in HA.
    el.setAttribute("label", label);
    const i = document.createElement("ha-icon");
    i.setAttribute("icon", icon);
    el.appendChild(i);
    return el;
  }
  const el = document.createElement("button");
  el.className = "fallback icon-only";
  el.title = label;
  el.setAttribute("aria-label", label);
  el.textContent = "✕";
  return el;
}
