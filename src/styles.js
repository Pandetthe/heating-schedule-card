export const styles = `
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
