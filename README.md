[![License](https://img.shields.io/github/license/Pandetthe/heating-schedule-card?label=License&color=%230b0&style=flat-square)](https://github.com/Pandetthe/heating-schedule-card/blob/main/LICENSE)
[![Release](https://img.shields.io/github/v/release/Pandetthe/heating-schedule-card?label=Release&style=flat-square&color=blue)](https://github.com/Pandetthe/heating-schedule-card/releases)
[![Check](https://img.shields.io/github/actions/workflow/status/Pandetthe/heating-schedule-card/check.yml?label=Check&style=flat-square&logo=githubactions)](https://github.com/Pandetthe/heating-schedule-card/actions/workflows/check.yml)
[![HACS](https://img.shields.io/badge/HACS-Custom-orange?style=flat-square)](https://hacs.xyz)

# Heating Schedule Card

A Lovelace card for editing the blocks of Home Assistant's native
[schedule helper](https://www.home-assistant.io/integrations/schedule/) together with
a value stored in each block, such as a target temperature.

Home Assistant can already keep extra data in schedule blocks, but its editor only
offers a raw YAML field for it. This card gives each block time fields and a slider,
so a heating plan stays in plain schedule helpers instead of a separate integration's
storage, and your own automations decide what to do with it.

## Features

- Every day as a collapsible list of blocks with start/end times and a value slider.
- Slider range and step taken from the room's thermostats, found by the schedule's area.
- Optional grouping of days with identical blocks (Mon–Fri, Sat–Sun, ...); chips move
  a day in or out of a group.
- Copy and paste blocks between days and between cards, e.g. from one room to another.
- Overlapping or reversed blocks are reported before saving; nothing is written until
  you press **Save changes**, and **Discard** reloads the schedule.
- Other keys in a block's data are kept as they are.
- Time and number formats follow your Home Assistant profile; texts in English and
  Polish, following the profile language.
- Built from Home Assistant's own elements, so it matches your theme.

## Installation

### HACS

1. In HACS, open the menu ⋮ → **Custom repositories**.
2. Add `https://github.com/Pandetthe/heating-schedule-card` with the type **Dashboard**.
3. Install **Heating Schedule Card** and reload the browser.

### Manual

1. Download `heating-schedule-card.js` from the
   [latest release](https://github.com/Pandetthe/heating-schedule-card/releases/latest)
   into `/config/www/`.
2. Add it under **Settings → Dashboards → ⋮ → Resources** as
   `/local/heating-schedule-card.js` with the type **JavaScript module**.
3. Reload the browser.

## Configuration

```yaml
type: custom:heating-schedule-card
entity: schedule.heating_living_room
```

| Option | Default | Description |
|---|---|---|
| `entity` | required | The `schedule.*` entity to edit. |
| `title` | schedule name | Card title. |
| `data_key` | `temperature` | Key in each block's data that holds the value. |
| `unit` | `°C` | Unit shown next to values. |
| `thermostat` | climate entities in the schedule's area | A `climate.*` entity or a list of them; the slider uses the intersection of their ranges and the largest step. |
| `min`, `max`, `step` | from the thermostats, else `7`, `30`, `0.5` | Slider limits; override the thermostats. |
| `default_value` | `21` | Value of a newly added block, fitted to the slider range. |
| `group_days` | `false` | Group days with identical blocks. |
| `language` | Home Assistant profile | `en` or `pl`; other languages fall back to English. |

A block saved by the card looks like this in the schedule:

```yaml
monday:
  - from: "06:30:00"
    to: "09:00:00"
    data:
      temperature: 21.5
```

## Using the value in automations

While a block is active, the schedule entity is `on` and exposes the block's data as
attributes. A minimal automation that applies the active block's temperature:

```yaml
triggers:
  - trigger: state
    entity_id: schedule.heating_living_room
actions:
  - action: climate.set_temperature
    target:
      entity_id: climate.living_room
    data:
      temperature: >-
        {{ state_attr('schedule.heating_living_room', 'temperature')
           if is_state('schedule.heating_living_room', 'on') else 18 }}
```

## Development

The card is a single JavaScript file with no build step and no runtime dependencies.
Tests run it in [jsdom](https://github.com/jsdom/jsdom) against a fake Home Assistant:

```sh
scripts/check.sh
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/); releases
use CalVer and are published by the `Publish` workflow.

## License

[MIT](LICENSE)
