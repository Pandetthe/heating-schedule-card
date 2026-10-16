export const hhmm = (s) => (s || "00:00:00").slice(0, 5);
export const withSeconds = (s) => (s.length === 5 ? s + ":00" : s);
export const toMinutes = (s) => {
  const [h, m] = hhmm(s).split(":").map(Number);
  return h * 60 + m;
};

/* 12/24 h format from the HA profile (hass.locale.time_format), not from the
   browser - a native input type=time takes its format from the browser language. */
export function uses12h(hass) {
  const l = (hass && hass.locale) || {};
  if (l.time_format === "12") return true;
  if (l.time_format === "24") return false;
  const locale = l.time_format === "system" ? undefined : (l.language || hass?.language);
  return !!new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hour12;
}

export const pad2 = (n) => String(n).padStart(2, "0");

/* Numbers formatted like in HA (hass.locale.number_format), e.g. "20,0" in Polish -
   the same as the input_number sliders next to the card. */
const NUMBER_FORMAT_LOCALE = { comma_decimal: "en-US", decimal_comma: "de", space_comma: "fr" };
export function numberFormatter(hass) {
  const l = (hass && hass.locale) || {};
  const locale = l.number_format === "system" ? undefined
    : NUMBER_FORMAT_LOCALE[l.number_format] || l.language || hass?.language;
  const f = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
    useGrouping: l.number_format !== "none",
  });
  return (n) => f.format(Number(n));
}
