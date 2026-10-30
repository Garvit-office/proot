// Proot logo artwork as SVG strings, so web (<img>/inline) and mobile (react-native-svg)
// render the exact same geometry. Source: brand/proot_primary_transparent.svg.
export const brandColors = {
  teal: "#1E4D5C",
  orange: "#F2804B",
  cream: "#FDF5EC",
  white: "#FFFFFF",
} as const;

type Variant = "light" | "dark";

function face(fg: string, eyeDot: string) {
  const { orange } = brandColors;
  return [
    `<ellipse cx="318" cy="-12" rx="24" ry="44" transform="rotate(38 318 -12)" fill="${orange}"/>`,
    `<ellipse cx="604" cy="-12" rx="24" ry="44" transform="rotate(-38 604 -12)" fill="${orange}"/>`,
    `<g fill="none" stroke="${fg}" stroke-width="30"><circle cx="372" cy="70" r="69"/><circle cx="550" cy="70" r="69"/></g>`,
    `<circle cx="382" cy="62" r="29" fill="${fg}"/><circle cx="392" cy="51" r="9" fill="${eyeDot}"/>`,
    `<circle cx="560" cy="62" r="29" fill="${fg}"/><circle cx="570" cy="51" r="9" fill="${eyeDot}"/>`,
    `<path d="M440 132 Q461 121 482 132 Q481 154 461 160 Q441 154 440 132 Z" fill="${fg}"/>`,
    `<path d="M450 180 Q450 206 461 206 Q472 206 472 180 Z" fill="${orange}"/>`,
    `<path d="M461 160 V170 M461 170 Q448 186 433 178 M461 170 Q474 186 489 178" fill="none" stroke="${fg}" stroke-width="8" stroke-linecap="round"/>`,
  ].join("");
}

/** Full "PROOT" wordmark. `light` = teal on light backgrounds, `dark` = cream on teal. */
export function wordmarkSvg(variant: Variant = "light") {
  const { teal, cream, white } = brandColors;
  const fg = variant === "light" ? teal : cream;
  const eyeDot = variant === "light" ? white : teal;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -58 852 270">` +
    `<g fill="none" stroke="${fg}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M15 140 V0 H50 A42 42 0 0 1 50 84 H15"/>` +
    `<path d="M152 140 V0 H187 A42 42 0 0 1 187 84 H152 M190 86 L232 140"/>` +
    `<path d="M697 0 H821 M759 0 V140"/></g>` +
    face(fg, eyeDot) +
    `</svg>`
  );
}

export const wordmarkAspect = 852 / 270;

/** Square app-icon mark: cream face on a rounded teal tile. Pass `tile: false` for the bare face. */
export function markSvg({ tile = true }: { tile?: boolean } = {}) {
  const { teal, cream } = brandColors;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="191 -192 540 540">` +
    (tile ? `<rect x="191" y="-192" width="540" height="540" rx="120" fill="${teal}"/>` : "") +
    face(cream, teal) +
    `</svg>`
  );
}

export function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
