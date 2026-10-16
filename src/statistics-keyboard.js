export const QUICK_KEYS = { s: "serve", r: "receive", a: "attack", b: "block", d: "defend", e: "inSystem", t: "outOfSystem", x: "secondAttack" };
const outcomes = { j: "success", k: "normal", l: "error" };
// Returns true only for a shortcut handled here. DOM focus/modal gating stays in the caller.
export function handleCaptureKey(event, actions) {
  if (event.isComposing) return false;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === "z") { event.preventDefault(); if (!event.repeat) actions.undo(); return true; }
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) return false;
  if (!/^\d$/.test(key) && !["enter", "backspace", "escape"].includes(key) && !QUICK_KEYS[key] && !outcomes[key]) return false;
  event.preventDefault();
  if (event.repeat) return true;
  if (/^\d$/.test(key)) actions.digit(key);
  else if (key === "enter") actions.select();
  else if (key === "backspace") actions.backspace();
  else if (key === "escape") actions.cancel();
  else if (QUICK_KEYS[key]) actions.group(QUICK_KEYS[key]);
  else actions.outcome(outcomes[key]);
  return true;
}
