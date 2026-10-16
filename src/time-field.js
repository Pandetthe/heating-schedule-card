import { hhmm, pad2 } from "./format.js";

/* Time field modelled on HA's ha-time-input (that element is not available to
   custom cards): separate hour and minute fields, digits only, arrow keys change
   the value, AM/PM only in 12 h mode. onChange fires only when focus leaves the
   whole control - re-rendering the card while moving from hours to minutes would
   lose focus. */
export function timeField(value, h12, labels, onChange) {
  let [h24, min] = hhmm(value).split(":").map(Number);
  const el = document.createElement("span");
  el.className = "time";

  const field = (label) => {
    const i = document.createElement("input");
    i.type = "text";
    i.inputMode = "numeric";
    i.maxLength = 2;
    i.autocomplete = "off";
    i.setAttribute("aria-label", label);
    i.addEventListener("focus", () => i.select());
    return i;
  };
  const hourField = field(labels.hour), minuteField = field(labels.minutes);
  const colon = document.createElement("span");
  colon.className = "colon";
  colon.textContent = ":";
  el.append(hourField, colon, minuteField);

  let ampm = null;
  if (h12) {
    ampm = document.createElement("button");
    ampm.type = "button";
    ampm.className = "ampm";
    ampm.addEventListener("click", () => {
      h24 = (h24 + 12) % 24;
      show();
    });
    el.append(ampm);
  }

  const show = () => {
    hourField.value = h12 ? String(h24 % 12 || 12) : pad2(h24);
    minuteField.value = pad2(min);
    if (ampm) ampm.textContent = h24 >= 12 ? "PM" : "AM";
  };
  // Hour field input -> h24 (in 12 h mode keeping AM/PM).
  const fromHours = (n) => (h12 ? (n % 12) + (h24 >= 12 ? 12 : 0) : n);
  const read = () => {
    const n = parseInt(hourField.value, 10);
    if (!Number.isNaN(n)) h24 = h12 ? fromHours(Math.min(Math.max(n, 1), 12)) : Math.min(n, 23);
    const m = parseInt(minuteField.value, 10);
    if (!Number.isNaN(m)) min = Math.min(m, 59);
  };

  [[hourField, "h"], [minuteField, "m"]].forEach(([i, kind]) => {
    i.addEventListener("input", () => {
      i.value = i.value.replace(/\D/g, "").slice(0, 2);
      // After a complete hour jump to minutes (like the HA time picker).
      const threshold = h12 ? 1 : 2;
      if (kind === "h" && (i.value.length === 2 || Number(i.value) > threshold)) {
        minuteField.focus();
      }
    });
    i.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
        ev.preventDefault();
        read();
        const d = ev.key === "ArrowUp" ? 1 : -1;
        if (kind === "h") h24 = (h24 + d + 24) % 24;
        else min = (min + d * 5 + 60) % 60;
        show();
        i.select();
      } else if (ev.key === "Enter") {
        i.blur();
      }
    });
  });

  let initial = `${pad2(h24)}:${pad2(min)}`;
  el.addEventListener("focusout", (ev) => {
    if (el.contains(ev.relatedTarget)) return;
    read();
    show();
    const current = `${pad2(h24)}:${pad2(min)}`;
    if (current !== initial) {
      initial = current;
      onChange(current);
    }
  });

  show();
  return el;
}
