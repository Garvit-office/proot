import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { canManageEvents, canOfferCare, theme as proot } from "@proot/shared";
import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ProfileDrawer } from "@/components/ProfileDrawer";
import { fonts } from "@/components/ui";
import { RealtimeProvider } from "@/lib/realtime";
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
      <RealtimeProvider>
        <RootNavigator />
      </RealtimeProvider>
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
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Home" }} />
          <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="activity" options={{ title: "Activity" }} />
          <Stack.Screen name="account" options={{ title: "Account" }} />
          <Stack.Screen name="addresses" options={{ title: "Addresses" }} />
          <Stack.Screen name="payment" options={{ title: "Payment" }} />
          <Stack.Screen name="product/[id]" options={{ title: "Listing" }} />
          <Stack.Screen name="cart" options={{ title: "Cart" }} />
          <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
          <Stack.Screen name="orders/index" options={{ title: "Your orders" }} />
          <Stack.Screen name="orders/[id]" options={{ title: "Order" }} />
          <Stack.Screen name="selling/index" options={{ title: "Your listings" }} />
          <Stack.Screen name="selling/edit" options={{ title: "Listing" }} />
          <Stack.Screen name="selling/orders" options={{ title: "Orders to fulfil" }} />
          <Stack.Screen name="service/[id]" options={{ title: "Service" }} />
          <Stack.Screen name="book/[id]" options={{ title: "Book" }} />
          <Stack.Screen name="bookings" options={{ title: "Your bookings" }} />
          <Stack.Screen name="events/[id]" options={{ title: "Event" }} />
          <Stack.Screen name="parks/[id]" options={{ title: "Park" }} />
          <Stack.Screen name="chat/[matchId]" options={{ title: "Chat" }} />
          <Stack.Protected guard={canManageEvents(user?.role)}>
            <Stack.Screen name="manage-events" options={{ title: "Manage events" }} />
          </Stack.Protected>
          <Stack.Protected guard={canOfferCare(user?.role)}>
            <Stack.Screen name="provider/services" options={{ title: "Your services" }} />
            <Stack.Screen name="provider/service-edit" options={{ title: "Service" }} />
            <Stack.Screen name="provider/bookings" options={{ title: "Booking requests" }} />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Screen name="onboarding" options={{ title: "Set up your dog" }} />
      </Stack>
      <ProfileDrawer />
    </ThemeProvider>
  );
}
