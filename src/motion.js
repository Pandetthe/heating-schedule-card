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
export function expand(el) {
  if (!el || reducedMotion()) return;
  el.style.overflow = "hidden";
  const a = el.animate([COLLAPSED, measure(el)], MOTION);
  a.onfinish = a.oncancel = () => { el.style.overflow = ""; };
}
export function collapse(el, then) {
  if (!el || reducedMotion()) return then();
  el.style.overflow = "hidden";
  el.style.pointerEvents = "none";
  const a = el.animate([measure(el), COLLAPSED], { ...MOTION, duration: 200, fill: "forwards" });
  a.onfinish = then;
}
