import { theme } from "@proot/shared";

const palette = {
  text: theme.colors.ink,
  background: theme.colors.bg,
  tint: theme.colors.brand,
  tabIconDefault: theme.colors.muted,
  tabIconSelected: theme.colors.brand,
};

// The app is light-only (app.json userInterfaceStyle), so both schemes share one palette.
export default { light: palette, dark: palette };
