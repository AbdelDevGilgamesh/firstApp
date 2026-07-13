import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLanguage } from "@/src/context/LanguageContext";
import { useAppTheme } from "@/src/theme/appTheme";

function TabBarIcon(props: {
  activeName: React.ComponentProps<typeof Ionicons>["name"];
  inactiveName: React.ComponentProps<typeof Ionicons>["name"];
  focused: boolean;
  theme: ReturnType<typeof useAppTheme>;
}) {
  const iconColor = props.focused ? props.theme.primary : props.theme.mutedText;

  return (
    <View
      style={[
        styles.iconContainer,
        props.focused && {
          backgroundColor: props.theme.primarySoft,
        },
      ]}
    >
      <Ionicons
        color={iconColor}
        name={props.focused ? props.activeName : props.inactiveName}
        size={23}
      />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { t } = useLanguage();
  const bottomInset = insets.bottom > 0 ? insets.bottom : 6;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.mutedText,
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: styles.tabBarItem,
        tabBarIconStyle: styles.tabBarIcon,
        tabBarStyle: {
          backgroundColor: theme.tabBarBackground,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
          height: 62 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6,
          shadowColor: "transparent",
          shadowOpacity: 0,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "800",
          marginTop: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.today"),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon
              activeName="home"
              focused={focused}
              inactiveName="home-outline"
              theme={theme}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t("tabs.add"),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon
              activeName="add-circle"
              focused={focused}
              inactiveName="add-circle-outline"
              theme={theme}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t("tabs.history"),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon
              activeName="calendar"
              focused={focused}
              inactiveName="calendar-outline"
              theme={theme}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.settings"),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon
              activeName="settings"
              focused={focused}
              inactiveName="settings-outline"
              theme={theme}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 38,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  tabBarIcon: {
    marginTop: 0,
  },
  tabBarItem: {
    minHeight: 48,
    paddingVertical: 0,
  },
});
