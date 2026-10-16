# Heating Schedule Card

Home Assistant Lovelace card for editing `schedule` helpers used as heating schedules: time blocks per day with a target temperature slider. Source modules live in `src/` (entry `src/heating-schedule-card.js`, texts in `src/translations/*.json`); esbuild bundles them into one readable ES module, `dist/heating-schedule-card.js`, which is attached to releases and installed by HACS. The card has no runtime dependencies.

## Commands

**Always use the project script for verification.** It prints clean ✓/✗ output and the full log only on failure (`VERBOSE=1` for everything).

```bash
scripts/check.sh          # JSON validation, build, tests
npm run build             # only the bundle, into dist/ (gitignored)
```

- Tests (`tests/*.test.mjs`) load the built bundle into jsdom with a fake `hass` from `tests/harness.mjs`, so they test exactly what users install. `esbuild` and `jsdom` are dev dependencies only.
- Try it in HA: build, copy `dist/heating-schedule-card.js` to `/config/www/`, add it as a dashboard resource (`/local/heating-schedule-card.js`, JavaScript module) and hard-reload the browser.

## How the card works

- Reads schedules with the websocket command `schedule/list` and saves with `schedule/update`. Each block stores its value in the block's `data` under `data_key` (default `temperature`); other keys in `data` are saved back untouched.
- Slider limits come from the thermostats: `thermostat` in the config, otherwise every `climate.*` in the schedule's area (entity area, else its device's area). The intersection of their ranges and the largest step; `min`/`max`/`step` in the config override them.
- Config options use English names; `LEGACY_OPTIONS` maps the old Polish ones (`grupuj_dni`, `termostat`), which must keep working.
- Renders only after loading and after user actions, never on every `hass` update: a re-render would interrupt a slider drag. Value changes patch the existing DOM (`_refreshState`) instead of calling `_render()`, so focus and animations survive.
- Uses HA's own elements (`ha-card`, `ha-button`, `ha-icon-button`, `ha-slider`) when they are registered, with plain HTML fallbacks. Time and number formats follow the HA user profile (`hass.locale`), not the browser.
- The copy/paste clipboard is shared by every card on the page (module-level state).
- UI texts live in `src/translations/<lang>.json`; add every new key to `en.json` (the fallback) and `pl.json`. A new language is a new JSON file registered in `src/i18n.js`. Plural forms go through `Intl.PluralRules`.

## Key constraints

- No runtime dependencies: everything the card needs is bundled into the single file in `dist/`.
- Respect `prefers-reduced-motion` in every animation.
- Theme only through HA CSS variables (`--primary-color`, `--divider-color`, ...), never hard-coded colours.

## Git

- Conventional Commits, lowercase imperative subject, scopes like `card`, `i18n`, `ci`, `docs`. Release notes are built from them.
- CalVer (`YYYY.M.patch`) in `package.json`, bumped only by the `publish` workflow; the build injects it into the console banner as `__VERSION__`. Never edit the version by hand.
