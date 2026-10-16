/* heating-schedule-card - edit heating schedule temperatures with a slider.
   Reads and writes `schedule` helpers over the HA websocket. */

const DAYS = [
  ["monday", "pn", "Poniedziałek"], ["tuesday", "wt", "Wtorek"],
  ["wednesday", "śr", "Środa"], ["thursday", "cz", "Czwartek"],
  ["friday", "pt", "Piątek"], ["saturday", "sb", "Sobota"],
  ["sunday", "nd", "Niedziela"],
];

const hhmm = (s) => (s || "00:00:00").slice(0, 5);
const withSeconds = (s) => (s.length === 5 ? s + ":00" : s);
const toMinutes = (s) => {
  const [h, m] = hhmm(s).split(":").map(Number);
  return h * 60 + m;
};

/* Picks the first registered element from a list of preferences.
   The card uses native HA elements where they exist and falls back to a simpler
   variant on older/newer versions instead of breaking. */
const firstDefined = (...names) => names.find((n) => customElements.get(n)) || null;

function haButton(text, { primary = false, icon = null } = {}) {
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

function haIconButton(icon, label) {
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

/* 12/24 h format from the HA profile (hass.locale.time_format), not from the
   browser - a native input type=time takes its format from the browser language. */
function uses12h(hass) {
  const l = (hass && hass.locale) || {};
  if (l.time_format === "12") return true;
  if (l.time_format === "24") return false;
  const locale = l.time_format === "system" ? undefined : (l.language || hass?.language);
  return !!new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hour12;
}

const pad2 = (n) => String(n).padStart(2, "0");

/* Numbers formatted like in HA (hass.locale.number_format), e.g. "20,0" in Polish -
   the same as the input_number sliders next to the card. */
const NUMBER_FORMAT_LOCALE = { comma_decimal: "en-US", decimal_comma: "de", space_comma: "fr" };
function numberFormatter(hass) {
  const l = (hass && hass.locale) || {};
  const locale = l.number_format === "system" ? undefined
    : NUMBER_FORMAT_LOCALE[l.number_format] || l.language || hass?.language;
  const f = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
    useGrouping: l.number_format !== "none",
  });
  return (n) => f.format(Number(n));
}

/* Time field modelled on HA's ha-time-input (that element is not available to
   custom cards): separate hour and minute fields, digits only, arrow keys change
   the value, AM/PM only in 12 h mode. onChange fires only when focus leaves the
   whole control - re-rendering the card while moving from hours to minutes would
   lose focus. */
function timeField(value, h12, onChange) {
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
  const hourField = field("Godzina"), minuteField = field("Minuty");
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

/* HA-style motion: expands/collapses only the changed element (height, margins,
   opacity) while everything below slides smoothly - without clipping the whole
   card. Curve and duration as in HA's Material animations. */
const MOTION = { duration: 250, easing: "cubic-bezier(.4,0,.2,1)" };
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function measure(el) {
  const cs = getComputedStyle(el);
  return { height: `${el.getBoundingClientRect().height}px`, marginTop: cs.marginTop,
    marginBottom: cs.marginBottom, opacity: 1 };
}
const COLLAPSED = { height: "0px", marginTop: "0px", marginBottom: "0px", opacity: 0 };
function expand(el) {
  if (!el || reducedMotion()) return;
  el.style.overflow = "hidden";
  const a = el.animate([COLLAPSED, measure(el)], MOTION);
  a.onfinish = a.oncancel = () => { el.style.overflow = ""; };
}
function collapse(el, then) {
  if (!el || reducedMotion()) return then();
  el.style.overflow = "hidden";
  el.style.pointerEvents = "none";
  const a = el.animate([measure(el), COLLAPSED], { ...MOTION, duration: 200, fill: "forwards" });
  a.onfinish = then;
}

/* Clipboard shared by every card on the page: copied blocks can be pasted into
   any day group of the same card or into another room's schedule. Like a regular
   clipboard it lasts until the next copy (or a page reload). */
let clipboard = null;   // { schedule, name, label, days: [...], blocks: [...] }
const cards = new Set();
function setClipboard(value) {
  clipboard = value;
  for (const c of cards) c._render();
}

class HeatingScheduleCard extends HTMLElement {
  connectedCallback() {
    cards.add(this);
    if (this._card) this._render();
  }

  disconnectedCallback() {
    cards.delete(this);
  }

  setConfig(config) {
    if (!config || !config.entity || !config.entity.startsWith("schedule.")) {
      throw new Error("Wymagane: entity wskazujące na encję schedule.*");
    }
    // min/max/step default to the room's thermostats (see _limits); the config
    // can override them.
    this._config = { unit: "°C", grupuj_dni: false, ...config };
    this._scheduleId = config.entity.split(".")[1];
    this._data = null;       // { name, icon, days: {day: [blocks]} }
    this._dirty = false;
    this._error = null;
    this._saving = false;
    // Which days are expanded. Only today by default, so the card does not
    // spread over all seven days at once.
    this._expanded = new Set([DAYS[(new Date().getDay() + 6) % 7][0]]);
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    // The card depends only on the schedule configuration (fetched over WS),
    // not on entity states. Re-rendering on every hass change would interrupt
    // a slider drag, so it renders only after loading and after user actions.
    if (first) this._load();
  }

  getCardSize() {
    return this._data ? 3 + Object.keys(this._data.days).length * 2 : 4;
  }

  static getStubConfig() {
    return { entity: "schedule.grzanie_salon" };
  }

  /* Room thermostats: `termostat` from the config (entity or list), otherwise
     every climate.<room>_* for schedule.grzanie_<room>. */
  _thermostats() {
    const t = this._config.termostat;
    if (t) return Array.isArray(t) ? t : [t];
    const room = this._scheduleId.replace(/^grzanie_/, "");
    return Object.keys(this._hass.states).filter((e) => e.startsWith(`climate.${room}_`));
  }

  /* Slider range like the thermostat's: with several valves the intersection of
     their ranges; step like HA's thermostat card (target_temp_step, else 0.5). */
  _limits() {
    const attrs = this._thermostats()
      .map((e) => this._hass.states[e])
      .filter(Boolean)
      .map((s) => s.attributes);
    const pick = (key, f, fallback) => {
      const v = attrs.map((a) => Number(a[key])).filter((x) => Number.isFinite(x) && x > 0);
      return v.length ? f(...v) : fallback;
    };
    return {
      min: Number(this._config.min ?? pick("min_temp", Math.max, 7)),
      max: Number(this._config.max ?? pick("max_temp", Math.min, 30)),
      step: Number(this._config.step ?? pick("target_temp_step", Math.max, 0.5)),
    };
  }

  async _load() {
    try {
      const list = await this._hass.callWS({ type: "schedule/list" });
      const s = list.find((x) => x.id === this._scheduleId);
      if (!s) throw new Error(`Nie znaleziono harmonogramu „${this._scheduleId}”`);
      const days = {};
      for (const [key] of DAYS) {
        days[key] = (s[key] || []).map((b) => ({
          from: hhmm(b.from),
          to: hhmm(b.to),
          temp: Number((b.data || {}).temperatura ?? this._limits().min),
          missingTemp: (b.data || {}).temperatura === undefined || (b.data || {}).temperatura === "",
        }));
      }
      this._data = { name: s.name, icon: s.icon, days };
      this._layout = this._initialLayout();
      this._original = this._signature();
      this._error = null;
    } catch (e) {
      this._error = e.message || String(e);
    }
    this._render();
  }

  /* Group layout computed on load: with grupuj_dni:true every day with identical
     blocks goes into one group (also non-adjacent ones, e.g. mon, tue, thu, fri
     + wed separately). After that the layout is editing state - changing blocks
     does not reshuffle groups mid-edit; days move between groups with chips
     (_toggleDay). */
  _initialLayout() {
    if (!this._config.grupuj_dni) return DAYS.map(([k]) => [k]);
    const sig = (d) =>
      JSON.stringify(this._data.days[d].map((b) => [b.from, b.to, b.temp]));
    const bySig = new Map();
    for (const [k] of DAYS) {
      const s = sig(k);
      if (!bySig.has(s)) bySig.set(s, []);
      bySig.get(s).push(k);
    }
    return [...bySig.values()];
  }

  /* Blocks of every day in comparable form (sorted, without helper fields) -
     to check whether anything really changed. */
  _signature() {
    return JSON.stringify(DAYS.map(([k]) => [...this._data.days[k]]
      .sort((a, b) => toMinutes(a.from) - toMinutes(b.from))
      .map((b) => [b.from, b.to, Number(b.temp)])));
  }

  _groups() {
    const index = (k) => DAYS.findIndex(([d]) => d === k);
    return this._layout
      .map((days) => [...days].sort((a, b) => index(a) - index(b)))
      .sort((a, b) => index(a[0]) - index(b[0]))
      .map((days) => ({
        days,
        short: days.map((k) => DAYS[index(k)][1]),
        full: this._config.grupuj_dni ? null : DAYS[index(days[0])][2],
      }));
  }

  /* A run of days as "a–b" (two days too: "sb–nd"), commas only between
     scattered pieces: "pn–wt, cz–pt", "pn, śr, pt"; the whole week = "codziennie". */
  _label(g) {
    if (g.full) return g.full;
    if (g.days.length === 7) return "codziennie";
    const idx = g.days.map((k) => DAYS.findIndex(([d]) => d === k));
    const parts = [];
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
      const len = j - i + 1;
      parts.push(len >= 2 ? `${DAYS[idx[i]][1]}–${DAYS[idx[j]][1]}` : DAYS[idx[i]][1]);
      i = j + 1;
    }
    return parts.join(", ");
  }

  /* Day chip in an expanded group: a day from the group -> splits it into its own
     group (with the same blocks, ready to change); a day outside the group ->
     joins it and copies the group's blocks to it. */
  _toggleDay(group, day) {
    const source = this._layout.find((u) => u.includes(day));
    if (group.days.includes(day)) {
      if (group.days.length === 1) return;
      source.splice(source.indexOf(day), 1);
      this._layout.push([day]);
      this._newGroup = day;
    } else {
      source.splice(source.indexOf(day), 1);
      if (!source.length) this._layout.splice(this._layout.indexOf(source), 1);
      this._layout.find((u) => u.includes(group.days[0])).push(day);
      this._data.days[day] = this._data.days[group.days[0]].map((b) => ({ ...b }));
      this._dirty = true;
    }
    // Both groups (old and new) stay expanded so the effect is visible.
    this._expanded.add(day);
    for (const k of source) this._expanded.add(k);
    for (const k of group.days) this._expanded.add(k);
    this._render();
  }

  _validationErrors() {
    const errors = [];
    for (const [key, short] of DAYS) {
      const blocks = [...this._data.days[key]].sort(
        (x, y) => toMinutes(x.from) - toMinutes(y.from)
      );
      for (let i = 0; i < blocks.length; i++) {
        if (toMinutes(blocks[i].to) <= toMinutes(blocks[i].from))
          errors.push(`${short}: blok ${blocks[i].from}-${blocks[i].to} kończy się przed startem`);
        if (i > 0 && toMinutes(blocks[i].from) < toMinutes(blocks[i - 1].to))
          errors.push(`${short}: bloki ${blocks[i - 1].from}-${blocks[i - 1].to} i ${blocks[i].from}-${blocks[i].to} nachodzą na siebie`);
      }
    }
    return errors;
  }

  _change(group, idx, field, value) {
    for (const d of group.days) {
      const block = this._data.days[d][idx];
      if (!block) continue;
      block[field] = value;
      if (field === "temp") block.missingTemp = false;
    }
    // A value change (temperature, time) does not change the card layout - no
    // DOM rebuild: only day summaries, errors and the save bar. Nothing jumps
    // and focus stays in the fields.
    this._refreshState();
  }

  /* Validation errors and the save bar - separate from the rest of the card, so
     a value change refreshes only this part. */
  _renderFooter() {
    const errorsSlot = this._body.querySelector(".errors-slot");
    const barSlot = this._body.querySelector(".save-bar-slot");
    if (!errorsSlot || !barSlot) return;
    const errors = this._validationErrors();
    this._dirty = this._signature() !== this._original;

    let errorsHtml = "";
    if (errors.length) errorsHtml += `<div class="error">${errors.map((x) => `• ${x}`).join("<br>")}</div>`;
    if (this._error) errorsHtml += `<div class="error">${this._error}</div>`;
    if (errorsHtml !== this._errorsHtml) {
      const had = !!this._errorsHtml;
      this._errorsHtml = errorsHtml;
      if (!errorsHtml && had && errorsSlot.firstElementChild) {
        collapse(errorsSlot, () => { errorsSlot.innerHTML = this._errorsHtml; errorsSlot.getAnimations().forEach((a) => a.cancel()); errorsSlot.style.cssText = ""; });
      } else {
        errorsSlot.getAnimations().forEach((a) => a.cancel());
        errorsSlot.style.cssText = "";
        errorsSlot.innerHTML = errorsHtml;
        if (!had) expand(errorsSlot);
      }
    }

    // Save bar only when there is something to save (or a save is running/done).
    const canSave = this._dirty && !errors.length && !this._saving;
    const visible = this._dirty || this._saving || this._saved;
    const show = visible && !barSlot.firstElementChild;
    const hide = !visible && barSlot.firstElementChild;
    this._footerVisible = visible;
    if (hide) {
      collapse(barSlot, () => {
        if (this._dirty || this._saving || this._saved) return;
        barSlot.innerHTML = "";
        barSlot.getAnimations().forEach((a) => a.cancel());
        barSlot.style.cssText = "";
      });
      return;
    }
    if (!visible) return;
    barSlot.getAnimations().forEach((a) => a.cancel());
    barSlot.style.cssText = "";
    barSlot.innerHTML = `<div class="save-bar${canSave ? " changed" : ""}">
        <span class="status">${
          this._saving ? "Zapisywanie…"
          : errors.length ? "Popraw błędy, żeby zapisać"
          : this._dirty ? "Masz niezapisane zmiany"
          : "Zapisano"
        }</span>
        <span class="actions">${this._dirty && !this._saving ? `<span class="slot-discard"></span>` : ""}${this._dirty || this._saving ? `<span class="slot-save"></span>` : ""}</span>
      </div>`;
    const saveSlot = barSlot.querySelector(".slot-save");
    if (saveSlot) {
      const el = haButton("Zapisz zmiany", { primary: true });
      const disabled = !this._dirty || errors.length > 0 || this._saving;
      el.disabled = disabled;
      if (disabled) el.setAttribute("disabled", "");
      el.addEventListener("click", () => this._save());
      saveSlot.replaceWith(el);
    }
    const discardSlot = barSlot.querySelector(".slot-discard");
    if (discardSlot) {
      const el = haButton("Odrzuć");
      el.addEventListener("click", () => this._discard());
      discardSlot.replaceWith(el);
    }
    if (show) expand(barSlot);
  }

  /* On a full re-render a save bar that was already visible does not slide in again. */
  _renderFooterAfterDraw() {
    const wasVisible = this._footerVisible;
    this._renderFooter();
    const barSlot = this._body.querySelector(".save-bar-slot");
    if (wasVisible && barSlot) barSlot.getAnimations().forEach((a) => a.finish());
  }

  /* "1 blok · 23,0 °C" in the group header. */
  _summary(g) {
    const fmt = numberFormatter(this._hass);
    const { unit } = this._config;
    const blocks = this._data.days[g.days[0]];
    const t = blocks.map((b) => Number(b.temp));
    const n = blocks.length;
    const count = n === 0 ? "brak bloków" : n === 1 ? "1 blok" : n < 5 ? `${n} bloki` : `${n} bloków`;
    if (!n) return count;
    const lo = Math.min(...t), hi = Math.max(...t);
    return `${count} · ${lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`} ${unit}`;
  }

  _refreshState() {
    this._groups().forEach((g, gi) => {
      const el = this._body.querySelector(`.group[data-g="${gi}"] .summary`);
      if (el) el.textContent = this._summary(g);
    });
    this._renderFooter();
  }

  _remove(group, idx) {
    for (const d of group.days) this._data.days[d].splice(idx, 1);
    this._dirty = true;
    this._render();
  }

  /* Finds a free gap in the day (at least 30 min) so a new block does not overlap
     existing ones. Prefers the gap after the last block, otherwise the widest. */
  _freeGap(blocks) {
    const MIN = 30, DAY_END = 24 * 60 - 1;
    const sorted = [...blocks].sort((a, b) => toMinutes(a.from) - toMinutes(b.from));
    const gaps = [];
    let cursor = 0;
    for (const b of sorted) {
      const s = toMinutes(b.from);
      if (s - cursor >= MIN) gaps.push([cursor, s]);
      cursor = Math.max(cursor, toMinutes(b.to));
    }
    if (DAY_END - cursor >= MIN) gaps.push([cursor, DAY_END]);
    if (!gaps.length) return null;
    const afterLast = gaps[gaps.length - 1][1] === DAY_END ? gaps[gaps.length - 1] : null;
    const widest = gaps.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a), gaps[0]);
    const [start, end] = afterLast || widest;
    return [start, Math.min(start + 120, end)];
  }

  _add(group) {
    const gap = this._freeGap(this._data.days[group.days[0]]);
    if (!gap) {
      this._error = "Brak wolnego miejsca w dobie - usuń lub skróć istniejący blok.";
      this._render();
      return;
    }
    const fmt = (m) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const [start, end] = gap;
    for (const d of group.days) {
      this._data.days[d].push({ from: fmt(start), to: fmt(end), temp: 21, missingTemp: false });
      this._data.days[d].sort((a, b) => toMinutes(a.from) - toMinutes(b.from));
    }
    // Remember which row is new, to highlight it with an enter animation.
    this._newBlock = { day: group.days[0], from: fmt(start) };
    this._error = null;
    this._dirty = true;
    this._render();
  }

  _copy(group) {
    setClipboard({
      schedule: this._scheduleId,
      name: this._roomName(),
      label: this._label(group),
      days: [...group.days],
      blocks: this._data.days[group.days[0]].map((b) => ({ ...b })),
    });
  }

  /* Name for the clipboard description: the schedule's area in HA (Living room,
     Bathroom...), because the schedules themselves share one name ("Heating"). */
  _roomName() {
    const h = this._hass || {};
    const e = h.entities?.[this._config.entity];
    const area = e?.area_id || (e?.device_id && h.devices?.[e.device_id]?.area_id);
    return (area && h.areas?.[area]?.name) || this._data.name || this._scheduleId;
  }

  _isClipboardSource(group) {
    return !!clipboard && clipboard.schedule === this._scheduleId
      && clipboard.days.length === group.days.length && group.days.every((d) => clipboard.days.includes(d));
  }

  /* Pastes the clipboard blocks into every day of the group (replacing its blocks).
     Temperatures are fitted to the range and step of this room's thermostats. */
  _paste(group) {
    if (!clipboard) return;
    const { min, max, step } = this._limits();
    const fit = (v) => Math.min(max, Math.max(min, Math.round(Number(v) / step) * step));
    for (const d of group.days) {
      this._data.days[d] = clipboard.blocks.map((b) => ({ ...b, temp: fit(b.temp), missingTemp: false }));
    }
    for (const d of group.days) this._expanded.add(d);
    this._render();
  }

  async _save() {
    if (this._validationErrors().length) return;
    this._saving = true;
    this._render();
    try {
      const msg = {
        type: "schedule/update",
        schedule_id: this._scheduleId,
        name: this._data.name,
        icon: this._data.icon,
      };
      for (const [key] of DAYS) {
        msg[key] = [...this._data.days[key]]
          .sort((a, b) => toMinutes(a.from) - toMinutes(b.from))
          .map((b) => ({
            from: withSeconds(b.from),
            to: withSeconds(b.to),
            data: { temperatura: Number(b.temp) },
          }));
      }
      await this._hass.callWS(msg);
      this._dirty = false;
      this._error = null;
      // The flag is cleared before _load(), because that is what renders the card
      // after saving - otherwise the footer stayed on "Zapisywanie…".
      this._saving = false;
      // A short confirmation, then the save bar hides.
      this._saved = true;
      await this._load();
      clearTimeout(this._savedTimer);
      this._savedTimer = setTimeout(() => {
        this._saved = false;
        // No re-render while a field is being edited - it would lose focus;
        // the bar disappears on the next re-render.
        if (!this._body.matches(":focus-within")) this._render();
      }, 2000);
      return;
    } catch (e) {
      this._error = `Zapis nieudany: ${e.message || e}`;
    }
    this._saving = false;
    this._render();
  }

  _discard() {
    this._dirty = false;
    this._error = null;
    this._load();
  }

  _render() {
    this._draw();
  }

  _draw() {
    if (!this._card) {
      this._card = document.createElement("ha-card");
      this._style = document.createElement("style");
      this._style.textContent = `
        /* Title -> first day spacing like HA's entities card (16 px): the ha-card
           header has 24 px bottom padding, the entities card pulls content up 8 px. */
        .content { padding:0 16px 16px; margin-top:-8px; }
        .group:first-of-type { margin-top:0; }
        .group { margin:12px 0 4px; }
        .group-header { display:flex; align-items:center; gap:4px;
          border-top:1px solid var(--divider-color); }
        .day-toggle { flex:1; display:flex; align-items:center; gap:8px; min-width:0;
          background:none; border:none; cursor:pointer; font:inherit; text-align:left;
          padding:10px 4px; color:var(--primary-text-color); border-radius:8px; }
        .day-toggle:hover { background:var(--secondary-background-color); }
        .day-toggle:focus-visible { outline:2px solid var(--primary-color); outline-offset:-2px; }
        .day-toggle ha-icon.chev { color:var(--secondary-text-color); --mdc-icon-size:20px;
          flex:0 0 auto; transition:transform .24s cubic-bezier(.4,0,.2,1); }
        .group.open .day-toggle ha-icon.chev { transform:rotate(90deg); }

        /* Expand animation: 0fr -> 1fr reaches the natural height smoothly,
           which max-height with a fixed value cannot do. */
        .group-body { display:grid; grid-template-rows:0fr;
          transition:grid-template-rows .26s cubic-bezier(.4,0,.2,1); }
        .group.open .group-body { grid-template-rows:1fr; }
        .group-inner { overflow:hidden; min-height:0; }
        .group.open .group-inner { padding-bottom:6px; }
        @media (prefers-reduced-motion: reduce) {
          .group-body { transition:none; }
          .day-toggle ha-icon.chev { transition:none; }
        }
        .group-header ha-icon-button.active { color:var(--primary-color); }
        .chips { display:flex; flex-wrap:wrap; gap:6px; padding:4px 0 8px; }
        .chip { font:inherit; font-size:.8rem; min-width:34px; height:28px; padding:0 10px; cursor:pointer;
          border-radius:14px; border:1px solid var(--divider-color); background:none;
          color:var(--secondary-text-color); transition:background .15s ease, color .15s ease, border-color .15s ease; }
        .chip:hover { border-color:var(--primary-color); color:var(--primary-text-color); }
        .chip.on { background:color-mix(in srgb, var(--primary-color) 22%, transparent);
          border-color:transparent; color:var(--primary-text-color); font-weight:500; }
        .chip[disabled] { cursor:default; opacity:.85; }
        .chip:focus-visible { outline:2px solid var(--primary-color); outline-offset:1px; }
        .day-toggle .name { font-weight:600; font-size:.92rem; flex:0 0 auto; }
        .day-toggle .summary { color:var(--secondary-text-color); font-size:.84rem;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .group-header ha-icon-button { --mdc-icon-button-size:32px; --mdc-icon-size:17px; }
        .group:first-of-type .group-header { border-top:none; padding-top:0; }
        /* Two lines: times + remove on top, slider with value below.
           One line (~490 px) did not fit the card and clipped the value. */
        .row { display:grid; grid-template-columns:auto auto 1fr auto;
          grid-template-areas:"from to . remove" "slider slider slider val";
          align-items:center; column-gap:8px; row-gap:2px; padding:6px 0; }
        .row > :nth-child(1) { grid-area:from; }
        .row > :nth-child(2) { grid-area:to; }
        .row > :nth-child(3) { grid-area:slider; min-width:0; }
        .row > :nth-child(4) { grid-area:val; }
        .row > :nth-child(5) { grid-area:remove; justify-self:end; }
        .row ha-slider { width:100%; --md-slider-active-track-color:var(--primary-color);
          --md-slider-handle-color:var(--primary-color); }
        .row input[type=range] { width:100%; accent-color:var(--primary-color); }
        .val { font-variant-numeric:tabular-nums; min-width:72px; text-align:right;
          color:var(--primary-text-color); font-size:.95rem; }
        ha-icon-button { --mdc-icon-button-size:40px; --mdc-icon-size:20px;
          color:var(--secondary-text-color); flex:0 0 auto; }
        ha-icon-button.remove:hover { color:var(--error-color); }
        ha-icon-button:not(.remove):hover { color:var(--primary-text-color); }
        /* Time field: looks like an HA text field (outline, radius, focus). */
        .time { display:inline-flex; align-items:center; height:36px; padding:0 8px;
          border:1px solid var(--divider-color); border-radius:8px; gap:1px;
          background:var(--card-background-color); color:var(--primary-text-color);
          font-variant-numeric:tabular-nums; transition:border-color .15s ease; }
        .time:hover { border-color:var(--secondary-text-color); }
        .time:focus-within { border-color:var(--primary-color); box-shadow:0 0 0 1px var(--primary-color); }
        .time input { width:2.2ch; border:none; outline:none; background:none; padding:0;
          color:inherit; font:inherit; font-size:.95rem; text-align:center; caret-color:var(--primary-color); }
        .time input:focus { background:color-mix(in srgb, var(--primary-color) 18%, transparent); border-radius:4px; }
        .time .colon { color:var(--secondary-text-color); }
        .time .ampm { margin-left:6px; border:none; border-radius:4px; padding:2px 4px; cursor:pointer;
          background:var(--secondary-background-color); color:var(--primary-text-color); font:inherit; font-size:.8rem; }
        .empty { color:var(--secondary-text-color); font-style:italic; padding:4px 0; }
        /* Fallbacks: used only when the HA element is missing. */
        .fallback { font:inherit; border:1px solid var(--divider-color); border-radius:8px;
          background:var(--card-background-color); color:var(--primary-text-color);
          padding:6px 12px; cursor:pointer; }
        .fallback.primary { background:var(--primary-color); color:var(--text-primary-color);
          border-color:var(--primary-color); }
        .fallback[disabled] { opacity:.45; cursor:default; }
        .fallback.icon-only { border:none; background:none; font-size:1.15rem; padding:2px 8px; }
        .save-bar { display:flex; justify-content:space-between; align-items:center;
          gap:12px; margin-top:14px; padding:12px 14px; border-radius:10px;
          background:var(--secondary-background-color); transition:background .2s ease; }
        .save-bar.changed { background:color-mix(in srgb, var(--primary-color) 14%, transparent); }
        .save-bar.changed .status { color:var(--primary-color); font-weight:600; }
        .save-bar-slot, .errors-slot { display:flow-root; }
        .save-bar .actions { display:flex; gap:8px; align-items:center; }
        .save-bar mwc-button, .save-bar ha-button { --mdc-theme-primary:var(--primary-color); }

        .status { font-size:.85rem; color:var(--secondary-text-color); }
        .error { color:var(--error-color); font-size:.85rem; padding:8px 0; }
        .warning { color:var(--warning-color); font-size:.8rem; }
      `;
      this._card.appendChild(this._style);
      this._body = document.createElement("div");
      this._card.appendChild(this._body);
      this.appendChild(this._card);
    }

    if (this._error && !this._data) {
      this._body.innerHTML = `<div class="content error">${this._error}</div>`;
      return;
    }
    if (!this._data) {
      this._body.innerHTML = `<div class="content status">Wczytywanie…</div>`;
      return;
    }
    // "Unsaved changes" only when the data differs from what HA has saved - toggling
    // a day on and off (or a slider back to the same value) changes nothing.
    this._dirty = this._signature() !== this._original;

    const { unit } = this._config;
    const fmt = numberFormatter(this._hass);
    const { min, max, step } = this._limits();
    const title = this._config.title || this._data.name || this._scheduleId;

    const groups = this._groups();
    // Standard ha-card header (size and font like other HA cards), without an icon.
    this._card.header = title;
    let html = `<div class="content">`;

    groups.forEach((g, gi) => {
      const blocks = this._data.days[g.days[0]];
      const open = g.days.some((d) => this._expanded.has(d));
      const n = blocks.length;

      const isNew = this._newGroup && g.days.length === 1 && g.days[0] === this._newGroup;
      html += `<div class="group${open ? " open" : ""}${isNew ? " new" : ""}" data-g="${gi}">
        <div class="group-header">
          <button class="day-toggle" data-g="${gi}" aria-expanded="${open}">
            <ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>
            <span class="name">${this._label(g)}</span>
            <span class="summary">${this._summary(g)}</span>
          </button>
          ${clipboard ? `<span class="slot-paste" data-g="${gi}"></span>` : ""}
          <span class="slot-copy" data-g="${gi}"></span>
        </div>
        <div class="group-body"><div class="group-inner">`;
      if (this._config.grupuj_dni) {
        // Day chips: which days use these blocks.
        html += `<div class="chips" role="group" aria-label="Dni z tymi blokami">${DAYS.map(([k, short, full]) => {
          const on = g.days.includes(k);
          const only = on && g.days.length === 1;
          return `<button class="chip${on ? " on" : ""}" data-g="${gi}" data-d="${k}" aria-pressed="${on}"
            aria-label="${full}"${only ? " disabled" : ""}>${short}</button>`;
        }).join("")}</div>`;
      }

      if (!n) {
        html += `<div class="empty">brak bloków - obowiązuje podtrzymanie przez całą dobę</div>`;
      }
      blocks.forEach((b, bi) => {
        const isNewRow = this._newBlock && this._newBlock.day === g.days[0] && this._newBlock.from === b.from;
        html += `<div class="row${isNewRow ? " new" : ""}">
          <span class="slot-from" data-g="${gi}" data-b="${bi}"></span>
          <span class="slot-to" data-g="${gi}" data-b="${bi}"></span>
          <span class="slot-slider" data-g="${gi}" data-b="${bi}"></span>
          <span class="val">${fmt(b.temp)} ${unit}</span>
          <span class="slot-remove" data-g="${gi}" data-b="${bi}"></span>
        </div>`;
      });
      html += `<span class="slot-add" data-g="${gi}"></span></div></div></div>`;
    });

    html += `<div class="footer"><div class="errors-slot"></div><div class="save-bar-slot"></div></div>`;
    html += `</div>`;

    this._body.innerHTML = html;
    this._errorsHtml = undefined;

    // Slider: HA's own element (ha-slider), so it looks and behaves exactly like
    // input_number rows. Falls back to a native range input if the element is
    // not registered yet.
    const native = !!customElements.get("ha-slider");
    this._body.querySelectorAll(".slot-slider").forEach((slot) => {
      const gi = +slot.dataset.g, bi = +slot.dataset.b;
      const block = this._data.days[groups[gi].days[0]][bi];
      let el;
      if (native) {
        el = document.createElement("ha-slider");
        el.setAttribute("labeled", "");
      } else {
        el = document.createElement("input");
        el.type = "range";
      }
      el.min = min; el.max = max; el.step = step; el.value = block.temp;
      const read = (ev) => Number(ev.target.value ?? el.value);
      el.addEventListener("input", (ev) => {
        const v = slot.parentElement.querySelector(".val");
        if (v) v.textContent = `${fmt(read(ev))} ${unit}`;
      });
      el.addEventListener("change", (ev) =>
        this._change(groups[gi], bi, "temp", read(ev))
      );
      slot.replaceWith(el);
    });
    // Time fields - text, in the 12/24 h format from the HA profile.
    const h12 = uses12h(this._hass);
    [["slot-from", "from"], ["slot-to", "to"]].forEach(([cls, field]) => {
      this._body.querySelectorAll(`.${cls}`).forEach((slot) => {
        const gi = +slot.dataset.g, bi = +slot.dataset.b;
        const block = this._data.days[groups[gi].days[0]][bi];
        const el = timeField(block[field], h12, (v) => this._change(groups[gi], bi, field, v));
        slot.replaceWith(el);
      });
    });

    // Removing a block - ha-icon-button with a close icon.
    this._body.querySelectorAll(".slot-remove").forEach((slot) => {
      const gi = +slot.dataset.g, bi = +slot.dataset.b;
      const el = haIconButton("mdi:close", "Usuń");
      el.classList.add("remove");
      el.addEventListener("click", () => {
        const row = el.closest(".row");
        // Remove only after collapsing - and only if the card was not re-rendered
        // in the meantime (e.g. "Discard"), because the index would then refer
        // to different data.
        collapse(row, () => { if (row.isConnected) this._remove(groups[gi], bi); });
      });
      slot.replaceWith(el);
    });

    // Day chips - moving days between groups.
    this._body.querySelectorAll(".chip").forEach((el) => {
      el.addEventListener("click", () => this._toggleDay(groups[+el.dataset.g], el.dataset.d));
    });

    // Expanding / collapsing a day.
    this._body.querySelectorAll(".day-toggle").forEach((el) => {
      el.addEventListener("click", () => {
        const gi = +el.dataset.g;
        const g = groups[gi];
        const open = g.days.some((d) => this._expanded.has(d));
        for (const d of g.days) {
          if (open) this._expanded.delete(d);
          else this._expanded.add(d);
        }
        // No full _render(): toggle the class on the existing DOM, so the CSS
        // transition has a start and end state to animate.
        const groupEl = this._body.querySelector(`.group[data-g="${gi}"]`);
        if (groupEl) groupEl.classList.toggle("open", !open);
        el.setAttribute("aria-expanded", String(!open));
      });
    });

    // Copying the group's blocks to the clipboard and pasting from it.
    this._body.querySelectorAll(".slot-copy").forEach((slot) => {
      const gi = +slot.dataset.g;
      const isSource = this._isClipboardSource(groups[gi]);
      const el = haIconButton("mdi:content-copy", "Kopiuj");
      if (isSource) el.classList.add("active");
      el.addEventListener("click", () => this._copy(groups[gi]));
      slot.replaceWith(el);
    });
    this._body.querySelectorAll(".slot-paste").forEach((slot) => {
      const gi = +slot.dataset.g;
      const el = haIconButton("mdi:content-paste", "Wklej");
      el.addEventListener("click", () => this._paste(groups[gi]));
      slot.replaceWith(el);
    });

    // Adding a block.
    this._body.querySelectorAll(".slot-add").forEach((slot) => {
      const gi = +slot.dataset.g;
      const el = haButton("Dodaj blok", { icon: "mdi:plus" });
      el.addEventListener("click", () => this._add(groups[gi]));
      slot.replaceWith(el);
    });

    // A save bar drawn from scratch on a full re-render does not slide in again -
    // it animates only when it appears for the first time.
    this._renderFooterAfterDraw();
    expand(this._body.querySelector(".row.new"));
    expand(this._body.querySelector(".group.new"));
    this._newBlock = null;
    this._newGroup = null;
  }
}

customElements.define("heating-schedule-card", HeatingScheduleCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "heating-schedule-card",
  name: "Harmonogram grzania",
  description: "Edycja bloków i temperatur harmonogramu suwakiem",
});
console.info("%c heating-schedule-card %c 1.16.1 ", "background:#0C6675;color:#fff", "background:#444;color:#fff");
