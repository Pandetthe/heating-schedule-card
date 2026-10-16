/* heating-schedule-card - edit the blocks of schedule helpers and a value stored in each.
   Reads and writes `schedule` helpers over the HA websocket. */

import { TRANSLATIONS, pickLanguage, format } from "./i18n.js";
import { hhmm, withSeconds, toMinutes, uses12h, numberFormatter } from "./format.js";
import { haButton, haIconButton } from "./ha-elements.js";
import { timeField } from "./time-field.js";
import { expand, collapse } from "./motion.js";
import { clipboard, cards, setClipboard } from "./clipboard.js";
import { styles } from "./styles.js";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/* Options renamed when the card was published; the old names keep working. */
const LEGACY_OPTIONS = { grupuj_dni: "group_days", termostat: "thermostat" };

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
      throw new Error(TRANSLATIONS[pickLanguage(config?.language || navigator.language)].entity_required);
    }
    const options = {};
    for (const [key, value] of Object.entries(config)) options[LEGACY_OPTIONS[key] || key] = value;
    // min/max/step default to the room's thermostats (see _limits); the config
    // can override them.
    this._config = { data_key: "temperature", unit: "°C", default_value: 21, group_days: false, ...options };
    this._scheduleId = config.entity.split(".")[1];
    this._data = null;       // { name, icon, days: {day: [blocks]} }
    this._dirty = false;
    this._error = null;
    this._saving = false;
    // Which days are expanded. Only today by default, so the card does not
    // spread over all seven days at once.
    this._expanded = new Set([DAYS[(new Date().getDay() + 6) % 7]]);
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

  static getStubConfig(hass) {
    const entity = Object.keys(hass?.states || {}).find((e) => e.startsWith("schedule.")) || "schedule.heating";
    return { entity };
  }

  _language() {
    return pickLanguage(this._config?.language || this._hass?.locale?.language
      || this._hass?.language || navigator.language);
  }

  /* Translated text; keys missing in a language fall back to English. */
  _t(key, params) {
    const text = TRANSLATIONS[this._language()][key] ?? TRANSLATIONS.en[key];
    return typeof text === "string" ? format(text, params) : text;
  }

  _blockCount(n) {
    const forms = this._t("blocks");
    if (n === 0) return forms.zero;
    const form = forms[new Intl.PluralRules(this._language()).select(n)] ?? forms.other;
    return format(form, { n });
  }

  /* Area of an entity: its own, otherwise its device's. */
  _area(entityId) {
    const h = this._hass || {};
    const e = h.entities?.[entityId];
    return e?.area_id || (e?.device_id && h.devices?.[e.device_id]?.area_id) || null;
  }

  /* Room thermostats: `thermostat` from the config (entity or list), otherwise
     every climate entity in the schedule's area. */
  _thermostats() {
    const t = this._config.thermostat;
    if (t) return Array.isArray(t) ? t : [t];
    const area = this._area(this._config.entity);
    if (!area) return [];
    return Object.keys(this._hass.states)
      .filter((e) => e.startsWith("climate.") && this._area(e) === area);
  }

  _fit(v) {
    const { min, max, step } = this._limits();
    return Math.min(max, Math.max(min, Math.round(Number(v) / step) * step));
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
      if (!s) throw new Error(this._t("not_found", { id: this._scheduleId }));
      const days = {};
      for (const key of DAYS) {
        days[key] = (s[key] || []).map((b) => ({
          from: hhmm(b.from),
          to: hhmm(b.to),
          value: Number((b.data || {})[this._config.data_key] ?? this._limits().min),
          // Other keys in the block's data are kept and saved back untouched.
          data: { ...(b.data || {}) },
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

  /* Group layout computed on load: with group_days:true every day with identical
     blocks goes into one group (also non-adjacent ones, e.g. mon, tue, thu, fri
     + wed separately). After that the layout is editing state - changing blocks
     does not reshuffle groups mid-edit; days move between groups with chips
     (_toggleDay). */
  _initialLayout() {
    if (!this._config.group_days) return DAYS.map((k) => [k]);
    const sig = (d) =>
      JSON.stringify(this._data.days[d].map((b) => [b.from, b.to, b.value]));
    const bySig = new Map();
    for (const k of DAYS) {
      const s = sig(k);
      if (!bySig.has(s)) bySig.set(s, []);
      bySig.get(s).push(k);
    }
    return [...bySig.values()];
  }

  /* Blocks of every day in comparable form (sorted, without helper fields) -
     to check whether anything really changed. */
  _signature() {
    return JSON.stringify(DAYS.map((k) => [...this._data.days[k]]
      .sort((a, b) => toMinutes(a.from) - toMinutes(b.from))
      .map((b) => [b.from, b.to, Number(b.value)])));
  }

  _groups() {
    const index = (k) => DAYS.indexOf(k);
    return this._layout
      .map((days) => [...days].sort((a, b) => index(a) - index(b)))
      .sort((a, b) => index(a[0]) - index(b[0]))
      .map((days) => ({
        days,
        full: this._config.group_days ? null : this._t("days_full")[index(days[0])],
      }));
  }

  /* A run of days as "a–b" (two days too: "sb–nd"), commas only between
     scattered pieces: "Mon–Tue, Thu–Fri", "Mon, Wed, Fri"; the whole week = "Every day". */
  _label(g) {
    if (g.full) return g.full;
    if (g.days.length === 7) return this._t("every_day");
    const short = this._t("days_short");
    const idx = g.days.map((k) => DAYS.indexOf(k));
    const parts = [];
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
      const len = j - i + 1;
      parts.push(len >= 2 ? `${short[idx[i]]}–${short[idx[j]]}` : short[idx[i]]);
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
      this._data.days[day] = this._data.days[group.days[0]].map((b) => ({ ...b, data: { ...b.data } }));
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
    DAYS.forEach((key, d) => {
      const day = this._t("days_short")[d];
      const blocks = [...this._data.days[key]].sort(
        (x, y) => toMinutes(x.from) - toMinutes(y.from)
      );
      for (let i = 0; i < blocks.length; i++) {
        if (toMinutes(blocks[i].to) <= toMinutes(blocks[i].from))
          errors.push(this._t("ends_before_start", { day, from: blocks[i].from, to: blocks[i].to }));
        if (i > 0 && toMinutes(blocks[i].from) < toMinutes(blocks[i - 1].to))
          errors.push(this._t("overlap", { day, from1: blocks[i - 1].from, to1: blocks[i - 1].to,
            from2: blocks[i].from, to2: blocks[i].to }));
      }
    });
    return errors;
  }

  _change(group, idx, field, value) {
    for (const d of group.days) {
      const block = this._data.days[d][idx];
      if (!block) continue;
      block[field] = value;
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
          this._saving ? this._t("saving")
          : errors.length ? this._t("fix_errors")
          : this._dirty ? this._t("unsaved")
          : this._t("saved")
        }</span>
        <span class="actions">${this._dirty && !this._saving ? `<span class="slot-discard"></span>` : ""}${this._dirty || this._saving ? `<span class="slot-save"></span>` : ""}</span>
      </div>`;
    const saveSlot = barSlot.querySelector(".slot-save");
    if (saveSlot) {
      const el = haButton(this._t("save"), { primary: true });
      const disabled = !this._dirty || errors.length > 0 || this._saving;
      el.disabled = disabled;
      if (disabled) el.setAttribute("disabled", "");
      el.addEventListener("click", () => this._save());
      saveSlot.replaceWith(el);
    }
    const discardSlot = barSlot.querySelector(".slot-discard");
    if (discardSlot) {
      const el = haButton(this._t("discard"));
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

  /* "1 block · 23.0 °C" in the group header. */
  _summary(g) {
    const fmt = numberFormatter(this._hass);
    const { unit } = this._config;
    const blocks = this._data.days[g.days[0]];
    const t = blocks.map((b) => Number(b.value));
    const n = blocks.length;
    const count = this._blockCount(n);
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
      this._error = this._t("no_free_gap");
      this._render();
      return;
    }
    const fmt = (m) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const [start, end] = gap;
    for (const d of group.days) {
      this._data.days[d].push({ from: fmt(start), to: fmt(end), value: this._fit(this._config.default_value), data: {} });
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
      blocks: this._data.days[group.days[0]].map((b) => ({ ...b, data: { ...b.data } })),
    });
  }

  /* Name for the clipboard description: the schedule's area in HA (Living room,
     Bathroom...), because the schedules themselves share one name ("Heating"). */
  _roomName() {
    const area = this._area(this._config.entity);
    return (area && this._hass?.areas?.[area]?.name) || this._data.name || this._scheduleId;
  }

  _isClipboardSource(group) {
    return !!clipboard && clipboard.schedule === this._scheduleId
      && clipboard.days.length === group.days.length && group.days.every((d) => clipboard.days.includes(d));
  }

  /* Pastes the clipboard blocks into every day of the group (replacing its blocks).
     Values are fitted to the range and step of this card's slider. */
  _paste(group) {
    if (!clipboard) return;
    for (const d of group.days) {
      this._data.days[d] = clipboard.blocks.map((b) => ({ ...b, data: { ...b.data }, value: this._fit(b.value) }));
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
      for (const key of DAYS) {
        msg[key] = [...this._data.days[key]]
          .sort((a, b) => toMinutes(a.from) - toMinutes(b.from))
          .map((b) => ({
            from: withSeconds(b.from),
            to: withSeconds(b.to),
            data: { ...b.data, [this._config.data_key]: Number(b.value) },
          }));
      }
      await this._hass.callWS(msg);
      this._dirty = false;
      this._error = null;
      // Cleared before _load(), because _load() renders the card after saving.
      this._saving = false;
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
      this._error = this._t("save_failed", { error: e.message || e });
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
      this._style.textContent = styles;
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
      this._body.innerHTML = `<div class="content status">${this._t("loading")}</div>`;
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
      if (this._config.group_days) {
        const [short, full] = [this._t("days_short"), this._t("days_full")];
        html += `<div class="chips" role="group" aria-label="${this._t("days_with_blocks")}">${DAYS.map((k, d) => {
          const on = g.days.includes(k);
          const only = on && g.days.length === 1;
          return `<button class="chip${on ? " on" : ""}" data-g="${gi}" data-d="${k}" aria-pressed="${on}"
            aria-label="${full[d]}"${only ? " disabled" : ""}>${short[d]}</button>`;
        }).join("")}</div>`;
      }

      if (!n) {
        html += `<div class="empty">${this._t("no_blocks")}</div>`;
      }
      blocks.forEach((b, bi) => {
        const isNewRow = this._newBlock && this._newBlock.day === g.days[0] && this._newBlock.from === b.from;
        html += `<div class="row${isNewRow ? " new" : ""}">
          <span class="slot-from" data-g="${gi}" data-b="${bi}"></span>
          <span class="slot-to" data-g="${gi}" data-b="${bi}"></span>
          <span class="slot-slider" data-g="${gi}" data-b="${bi}"></span>
          <span class="val">${fmt(b.value)} ${unit}</span>
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
      el.min = min; el.max = max; el.step = step; el.value = block.value;
      const read = (ev) => Number(ev.target.value ?? el.value);
      el.addEventListener("input", (ev) => {
        const v = slot.parentElement.querySelector(".val");
        if (v) v.textContent = `${fmt(read(ev))} ${unit}`;
      });
      el.addEventListener("change", (ev) =>
        this._change(groups[gi], bi, "value", read(ev))
      );
      slot.replaceWith(el);
    });
    const h12 = uses12h(this._hass);
    const labels = { hour: this._t("hour"), minutes: this._t("minutes") };
    [["slot-from", "from"], ["slot-to", "to"]].forEach(([cls, field]) => {
      this._body.querySelectorAll(`.${cls}`).forEach((slot) => {
        const gi = +slot.dataset.g, bi = +slot.dataset.b;
        const block = this._data.days[groups[gi].days[0]][bi];
        const el = timeField(block[field], h12, labels, (v) => this._change(groups[gi], bi, field, v));
        slot.replaceWith(el);
      });
    });

    this._body.querySelectorAll(".slot-remove").forEach((slot) => {
      const gi = +slot.dataset.g, bi = +slot.dataset.b;
      const el = haIconButton("mdi:close", this._t("remove"));
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

    this._body.querySelectorAll(".chip").forEach((el) => {
      el.addEventListener("click", () => this._toggleDay(groups[+el.dataset.g], el.dataset.d));
    });

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

    this._body.querySelectorAll(".slot-copy").forEach((slot) => {
      const gi = +slot.dataset.g;
      const isSource = this._isClipboardSource(groups[gi]);
      const el = haIconButton("mdi:content-copy", this._t("copy"));
      if (isSource) el.classList.add("active");
      el.addEventListener("click", () => this._copy(groups[gi]));
      slot.replaceWith(el);
    });
    this._body.querySelectorAll(".slot-paste").forEach((slot) => {
      const gi = +slot.dataset.g;
      const el = haIconButton("mdi:content-paste", this._t("paste"));
      el.addEventListener("click", () => this._paste(groups[gi]));
      slot.replaceWith(el);
    });

    this._body.querySelectorAll(".slot-add").forEach((slot) => {
      const gi = +slot.dataset.g;
      const el = haButton(this._t("add_block"), { icon: "mdi:plus" });
      el.addEventListener("click", () => this._add(groups[gi]));
      slot.replaceWith(el);
    });

    this._renderFooterAfterDraw();
    expand(this._body.querySelector(".row.new"));
    expand(this._body.querySelector(".group.new"));
    this._newBlock = null;
    this._newGroup = null;
  }
}

customElements.define("heating-schedule-card", HeatingScheduleCard);
window.customCards = window.customCards || [];
const pickerTexts = TRANSLATIONS[pickLanguage(navigator.language)];
window.customCards.push({
  type: "heating-schedule-card",
  name: pickerTexts.card_name,
  description: pickerTexts.card_description,
});
// __VERSION__ is replaced by the build with the version from package.json.
console.info(`%c heating-schedule-card %c ${__VERSION__} `, "background:#0C6675;color:#fff", "background:#444;color:#fff");
