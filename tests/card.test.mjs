import { test } from "node:test";
import assert from "node:assert/strict";
import { mount, schedule, block, text, button, setSlider, save, tick } from "./harness.mjs";

const living = (data) => schedule("living_room", { monday: [block("06:00", "08:00", data)] });

test("reads the value from the configured data key", async () => {
  const { card } = await mount(
    { entity: "schedule.living_room", data_key: "temperatura" },
    { schedules: [living({ temperatura: 22.5 })] },
  );
  assert.match(text(card), /1 blok · 22.5 °C/);
});

test("saves under the data key and keeps other data keys", async () => {
  const { card, w, sent } = await mount(
    { entity: "schedule.living_room" },
    { schedules: [living({ temperature: 21, note: "keep me" })] },
  );
  setSlider(card, w, 0, 23.5);
  const msg = await save(card, sent);
  assert.deepEqual(msg.monday, [
    { from: "06:00:00", to: "08:00:00", data: { temperature: 23.5, note: "keep me" } },
  ]);
});

test("takes slider limits from thermostats in the schedule's area", async () => {
  const { card } = await mount(
    { entity: "schedule.living_room" },
    {
      schedules: [living({ temperature: 21 })],
      entities: {
        "schedule.living_room": { area_id: "living" },
        "climate.left": { device_id: "trv1" },
        "climate.right": { area_id: "living" },
        "climate.bedroom": { area_id: "bedroom" },
      },
      devices: { trv1: { area_id: "living" } },
      states: {
        "climate.left": { attributes: { min_temp: 5, max_temp: 28, target_temp_step: 0.5 } },
        "climate.right": { attributes: { min_temp: 7, max_temp: 30, target_temp_step: 1 } },
        "climate.bedroom": { attributes: { min_temp: 15, max_temp: 20 } },
      },
    },
  );
  const slider = card.querySelector("input[type=range]");
  assert.deepEqual([slider.min, slider.max, slider.step], ["7", "28", "1"]);
});

test("config limits override the thermostats", async () => {
  const { card } = await mount(
    { entity: "schedule.living_room", thermostat: "climate.a", min: 10, max: 25, step: 0.1 },
    {
      schedules: [living({ temperature: 21 })],
      states: { "climate.a": { attributes: { min_temp: 5, max_temp: 30 } } },
    },
  );
  const slider = card.querySelector("input[type=range]");
  assert.deepEqual([slider.min, slider.max, slider.step], ["10", "25", "0.1"]);
});

test("legacy option names still work", async () => {
  const days = { monday: [block("06:00", "08:00", { temperature: 21 })], tuesday: [block("06:00", "08:00", { temperature: 21 })] };
  const { card } = await mount(
    { entity: "schedule.living_room", grupuj_dni: true, termostat: "climate.a" },
    {
      schedules: [schedule("living_room", days)],
      states: { "climate.a": { attributes: { min_temp: 10, max_temp: 20 } } },
    },
  );
  assert.match(text(card), /^pn–wt 1 blok/);
  assert.equal(card.querySelector("input[type=range]").max, "20");
});

test("a new block gets the default value fitted to the range", async () => {
  const { card, sent } = await mount(
    { entity: "schedule.living_room", default_value: 40, max: 30 },
    { schedules: [schedule("living_room")] },
  );
  card.querySelector("button[data-g]").click();
  button(card, "Dodaj blok").click();
  const msg = await save(card, sent);
  assert.deepEqual(msg.monday, [{ from: "00:00:00", to: "02:00:00", data: { temperature: 30 } }]);
});

test("overlapping blocks block saving", async () => {
  const { card } = await mount(
    { entity: "schedule.living_room" },
    { schedules: [schedule("living_room", { monday: [
      block("06:00", "09:00", { temperature: 21 }), block("08:00", "10:00", { temperature: 21 }),
    ] })] },
  );
  // Overlaps are only reported once something changes.
  button(card, "Dodaj blok").click();
  await tick();
  assert.match(text(card), /nachodzą na siebie/);
  assert.ok(button(card, "Zapisz zmiany").disabled);
});

test("stub config picks a schedule from this Home Assistant", async () => {
  const { Card } = await mount({ entity: "schedule.x" });
  assert.deepEqual({ ...Card.getStubConfig({ states: { "light.a": {}, "schedule.heating_bedroom": {} } }) },
    { entity: "schedule.heating_bedroom" });
});

test("rejects an entity that is not a schedule", async () => {
  const { Card } = await mount({ entity: "schedule.x" });
  assert.throws(() => new Card().setConfig({ entity: "climate.a" }));
});
