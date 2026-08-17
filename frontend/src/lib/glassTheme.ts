/**
 * Global glass theme — one strength knob drives every glass surface.
 * Ported concept (not copied code) from ozone-inventory's
 * src/lib/settings/glass-theme.ts: a single 0-100 intensity slider derives
 * every CSS custom property (blur, fill opacity, border opacity, shadow).
 *
 * Applied live via `applyGlassTheme()`, mounted once in SettingsContext's
 * existing `applyAppearance()` effect (Attendance's own "apply once on
 * load/change, every page picks it up" shell hook — the equivalent of
 * Inventory's separately-mounted <GlassThemeEffect>).
 *
 * "Off" is a hard switch, not an asymptotic fade to zero: when disabled or
 * intensity is 0, `applyGlassTheme` sets `data-glass="off"` on <html> and
 * every `.glass-surface*` CSS rule is scoped under `[data-glass="on"]`, so
 * the original Tailwind classes each component already has (bg-white,
 * border-slate-200, shadow-soft-*) are the only thing in effect — a real,
 * clean fallback rather than a heavily-reduced blur.
 */

export interface GlassThemeSettings {
  enabled: boolean;
  /** 0-100 */
  intensity: number;
}

export const GLASS_THEME_DEFAULTS: GlassThemeSettings = {
  enabled: true,
  intensity: 50,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Human label for the intensity slider. */
export function glassStrengthLabel(intensity: number): string {
  const n = clamp(intensity, 0, 100);
  if (n <= 0) return "Solid";
  if (n < 30) return "Subtle";
  if (n < 60) return "Balanced";
  if (n < 85) return "Premium";
  return "Maximum";
}

/**
 * True when glass should render at all. Both "disabled" and "intensity 0"
 * collapse to the same clean solid fallback (see module doc).
 */
export function isGlassOn(settings: GlassThemeSettings): boolean {
  return settings.enabled && settings.intensity > 0;
}

/**
 * Strength curve (0-1, only reached while glass is "on") -> derived tokens.
 * Floor values stay deliberately more conservative than a consumer app:
 * sidebar/nav text and stat-card numbers need to stay legible even at max
 * intensity, including outdoors on a site worker's phone.
 */
function deriveFromStrength(strength: number) {
  const s = clamp(strength, 0, 1);

  const fillOpacity = lerp(0.82, 0.55, s);
  const fillOpacityStrong = lerp(0.92, 0.7, s);
  const borderOpacity = lerp(0.5, 0.85, s);
  const blurPx = Math.round(lerp(4, 18, s) * 10) / 10;
  const saturate = lerp(1.05, 1.55, s);
  const shadowK = lerp(0.05, 0.12, s);
  const washOpacity = lerp(0.35, 0.85, s);

  const fill = `rgb(255 255 255 / ${fillOpacity.toFixed(3)})`;
  const fillStrong = `rgb(255 255 255 / ${fillOpacityStrong.toFixed(3)})`;
  const border = `rgb(255 255 255 / ${borderOpacity.toFixed(3)})`;

  const shadow = [
    `0 1px 2px rgb(15 23 42 / ${(shadowK * 0.5).toFixed(3)})`,
    `0 8px 24px rgb(15 23 42 / ${shadowK.toFixed(3)})`,
  ].join(", ");

  return { fill, fillStrong, border, blurPx, saturate, shadow, washOpacity };
}

/** Resolve settings -> CSS custom properties on `:root`. */
export function glassThemeToCssVars(settings: GlassThemeSettings): Record<string, string> {
  const on = isGlassOn(settings);
  const strength = on ? clamp(settings.intensity, 0, 100) / 100 : 0;
  const d = deriveFromStrength(strength);

  return {
    "--glass-strength": strength.toFixed(3),
    "--glass-blur": `${d.blurPx}px`,
    "--glass-saturate": d.saturate.toFixed(2),
    "--glass-fill": d.fill,
    "--glass-fill-strong": d.fillStrong,
    "--glass-border": d.border,
    "--glass-shadow": d.shadow,
    "--glass-wash-opacity": d.washOpacity.toFixed(3),
  };
}

/** Write resolved theme variables + the on/off switch onto `document.documentElement`. */
export function applyGlassTheme(
  settings: GlassThemeSettings,
  target: HTMLElement | null = typeof document !== "undefined" ? document.documentElement : null
) {
  if (!target) return;
  target.setAttribute("data-glass", isGlassOn(settings) ? "on" : "off");
  const vars = glassThemeToCssVars(settings);
  for (const [key, value] of Object.entries(vars)) {
    target.style.setProperty(key, value);
  }
}

export function glassSettingsFromAppearance(appearance: {
  glassEnabled?: boolean | null;
  glassIntensity?: number | null;
}): GlassThemeSettings {
  return {
    enabled: appearance.glassEnabled ?? GLASS_THEME_DEFAULTS.enabled,
    intensity: clamp(appearance.glassIntensity ?? GLASS_THEME_DEFAULTS.intensity, 0, 100),
  };
}
