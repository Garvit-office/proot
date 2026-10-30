// Single source of truth for the Proot look across webuser, webadmin, and mobile.
// The web apps consume the same values through styles/tokens.css — keep both in sync.
export const theme = {
  name: "proot",
  colors: {
    bg: "#FDF5EC",
    surface: "#FFFFFF",
    surface2: "#F8ECDF",
    ink: "#16323B",
    inkSoft: "#2F4A53",
    muted: "#69767B",
    line: "#EFE3D5",
    lineStrong: "#E0CFBC",

    brand: "#1E4D5C",
    brandHover: "#173D49",
    brandDeep: "#153842",
    brandSoft: "#E2ECEE",
    accent: "#F2804B",
    accentInk: "#C2551F",
    accentSoft: "#FDE8DB",

    good: "#2C7A4B",
    goodSoft: "#E1F2E7",
    warn: "#9A6410",
    warnSoft: "#FBEFD6",
    bad: "#B23F2C",
    badSoft: "#F9E3DE",
    info: "#3A5F9A",
    infoSoft: "#E5ECF7",
    calm: "#6A4FA0",
    calmSoft: "#ECE7F5",
  },
  radius: { sm: 10, md: 18, lg: 28, pill: 999 },
  // One typeface everywhere (matches the logo lockup); mobile loads the weights in apps/mobile/app/_layout.tsx.
  font: "Inter",
} as const;

export const verdictTone = { Good: "good", Okay: "warn", Skip: "bad" } as const;
