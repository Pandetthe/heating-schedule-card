# Heating Schedule Card

Home Assistant Lovelace card for editing `schedule` helpers used as heating schedules: time blocks per day with a target temperature slider. The whole card is one plain JS file, `heating-schedule-card.js`, with no build step and no dependencies; HACS serves it as-is.

## Commands

**Always use the project script for verification.** It prints clean ✓/✗ output and the full log only on failure (`VERBOSE=1` for everything).

```bash
scripts/check.sh          # syntax check, JSON validation, tests (when tests/ exists)
```

- Try it in HA: copy the file to `/config/www/`, add it as a dashboard resource (`/local/heating-schedule-card.js`, JavaScript module) and hard-reload the browser.

## How the card works

- Reads schedules with the websocket command `schedule/list` and saves with `schedule/update`. Each block stores its temperature in the block's `data` (key `temperatura`).
- Slider limits come from the room's thermostats (`climate.<room>_*` for `schedule.grzanie_<room>`, or `termostat` in the config): the intersection of their ranges and the largest step. `min`/`max`/`step` in the config override them.
- Renders only after loading and after user actions, never on every `hass` update: a re-render would interrupt a slider drag. Value changes patch the existing DOM (`_odswiezStan`) instead of calling `_render()`, so focus and animations survive.
- Uses HA's own elements (`ha-card`, `ha-button`, `ha-icon-button`, `ha-slider`) when they are registered, with plain HTML fallbacks. Time and number formats follow the HA user profile (`hass.locale`), not the browser.
- The copy/paste clipboard is shared by every card on the page (module-level state).

## Key constraints

- No build step, no runtime dependencies: the file in the repo is exactly what users install.
- Respect `prefers-reduced-motion` in every animation.
- Theme only through HA CSS variables (`--primary-color`, `--divider-color`, ...), never hard-coded colours.

## Git

- Conventional Commits, lowercase imperative subject, scopes like `card`, `i18n`, `ci`, `docs`. Release notes are built from them.
- CalVer (`YYYY.M.patch`), bumped only by the `publish` workflow (it rewrites the version in the console banner at the end of the card); never edit the version by hand.
