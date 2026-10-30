import { theme } from "@proot/shared";
import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text } from "react-native";
import { PetAvatar } from "@/components/ProfileDrawer";
import { fonts, Logo } from "@/components/ui";
import { useSession } from "@/lib/session";

const { colors } = theme;

function ProfileButton() {
  const { pet, user, setProfileOpen } = useSession();
  return (
    <Pressable
      style={styles.avatar}
      onPress={() => setProfileOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={pet ? `Open ${pet.name}’s profile` : "Open profile"}
    >
      {pet ? <PetAvatar pet={pet} size={34} /> : <Text style={styles.avatarText}>{user?.name[0]?.toUpperCase()}</Text>}
    </Pressable>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerRight: () => <ProfileButton />,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.sansSemi, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Proot",
          headerTitle: () => <Logo height={28} />,
          tabBarLabel: "Home",
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: "house", android: "home", web: "home" }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: "Shop",
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: "bag", android: "shopping_bag", web: "shopping_bag" }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="care"
        options={{
          title: "Care",
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: "heart", android: "favorite", web: "favorite" }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: "Around",
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: "map", android: "map", web: "map" }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="bowl"
        options={{
          title: "Nutrition",
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: "camera", android: "photo_camera", web: "photo_camera" }} tintColor={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 34,
    height: 34,
    marginRight: 16,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.accentSoft,
  },
  avatarText: { fontFamily: fonts.sansBold, color: colors.accentInk, fontSize: 14 },
});
