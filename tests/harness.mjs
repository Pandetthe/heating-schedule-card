// Loads the card into jsdom with a fake Home Assistant.
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../heating-schedule-card.js", import.meta.url), "utf8");

export const tick = () => new Promise((r) => setTimeout(r, 0));

export function block(from, to, data) {
  return { from: `${from}:00`, to: `${to}:00`, data };
}

export function schedule(id, days = {}) {
  return { id, name: "Heating", icon: "mdi:radiator", monday: [], tuesday: [], wednesday: [],
    thursday: [], friday: [], saturday: [], sunday: [], ...days };
}

/* Mounts a card. `schedules` is what schedule/list returns, `states` and
   `entities` go into hass. Returns the card, its window and the sent WS messages. */
export async function mount(config, { schedules = [], states = {}, entities = {}, devices = {}, areas = {}, language = "en" } = {}) {
  const dom = new JSDOM("<body></body>", { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: true });   // reduced motion: no animations
  w.Element.prototype.getAnimations = () => [];
  w.console.info = () => {};
  w.eval(source);

  const sent = [];
  const hass = {
    states, entities, devices, areas,
    language,
    locale: { language, time_format: "24", number_format: "comma_decimal" },
    callWS: async (msg) => {
      sent.push(msg);
      return msg.type === "schedule/list" ? schedules : {};
    },
  };
  const card = w.document.createElement("heating-schedule-card");
  card.setConfig(config);
  w.document.body.appendChild(card);
  card.hass = hass;
  await tick();
  return { card, w, hass, sent, Card: w.customElements.get("heating-schedule-card") };
}

export const text = (card) => {
  const c = card.cloneNode(true);
  c.querySelectorAll("style").forEach((s) => s.remove());
  return c.textContent.replace(/\s+/g, " ").trim();
};

export const button = (card, label) =>
  [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === label);

export function setSlider(card, w, index, value) {
  const slider = card.querySelectorAll("input[type=range]")[index];
  slider.value = String(value);
  slider.dispatchEvent(new w.Event("change"));
}

export async function save(card, sent) {
  button(card, "Save changes").click();
  await tick();
  // Plain objects: values created inside jsdom have another realm's prototypes.
  return JSON.parse(JSON.stringify(sent.filter((m) => m.type === "schedule/update").at(-1)));
}
