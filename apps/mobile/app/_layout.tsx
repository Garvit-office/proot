import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { canManageEvents, theme as proot } from "@proot/shared";
import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ProfileDrawer } from "@/components/ProfileDrawer";
import { fonts } from "@/components/ui";
import { SessionProvider, useSession } from "@/lib/session";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  anchor: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: proot.colors.bg,
    card: proot.colors.bg,
    text: proot.colors.ink,
    border: proot.colors.line,
    primary: proot.colors.brand,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!loaded && !error) return null;

  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

function RootNavigator() {
  const { status, onboarded, user } = useSession();

  // Keep the splash up until we know whether to show onboarding or the app.
  useEffect(() => {
    if (status !== "loading") SplashScreen.hideAsync();
  }, [status]);

  if (status === "loading") return null;

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: proot.colors.bg },
          headerTintColor: proot.colors.brand,
          headerTitleStyle: { fontFamily: fonts.heading, fontSize: 17, color: proot.colors.ink },
          contentStyle: { backgroundColor: proot.colors.bg },
        }}
      >
        {/* No dog yet → only onboarding is reachable; the app unlocks once a pet is saved. */}
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: "modal", title: "Profile" }} />
          <Stack.Protected guard={canManageEvents(user?.role)}>
            <Stack.Screen name="manage-events" options={{ title: "Manage events" }} />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Screen name="onboarding" options={{ title: "Set up your dog" }} />
      </Stack>
      <ProfileDrawer />
    </ThemeProvider>
  );
}
