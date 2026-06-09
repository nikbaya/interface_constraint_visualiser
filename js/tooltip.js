// Single shared cursor-following tooltip.
const el = document.getElementById("tooltip");

export function showTip(html, evt) {
  el.innerHTML = html;
  el.hidden = false;
  moveTip(evt);
}

export function moveTip(evt) {
  const pad = 14;
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
  el.style.left = x + "px";
  el.style.top = y + "px";
}

export function hideTip() {
  el.hidden = true;
}
