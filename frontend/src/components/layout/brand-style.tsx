import { useEffect } from "react";
import { useSite } from "./brand";

/** '#8a6914' -> [h, s, l] */
export function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}

/**
 * The firm's brand colour (Firm Website Settings) as the portal's primary colour. Written as a stylesheet rule, so a
 * colour preset someone picks in Appearance (an inline style) still wins. Dark mode uses a lighter shade for contrast.
 */
export function BrandStyle() {
  const { data } = useSite();
  const color = data?.brand_color;
  useEffect(() => {
    const hsl = color ? hexToHsl(color) : null;
    let el = document.getElementById("ptc-brand") as HTMLStyleElement | null;
    if (!hsl) { el?.remove(); return; }
    const [h, s, l] = hsl;
    const dark = `${h} ${s}% ${Math.min(l + 22, 62)}%`;
    if (!el) {
      el = document.createElement("style");
      el.id = "ptc-brand";
      document.head.appendChild(el);
    }
    el.textContent = `:root{--primary:${h} ${s}% ${l}%;--ring:${h} ${s}% ${l}%}.dark{--primary:${dark};--ring:${dark}}`;
  }, [color]);
  return null;
}
