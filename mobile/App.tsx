import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import type { RootStackParamList, TabParamList } from "./src/navigation/types";
import AuthScreen from "./src/screens/AuthScreen";
import CollectionsScreen from "./src/screens/CollectionsScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import ReaderScreen from "./src/screens/ReaderScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import StatsScreen from "./src/screens/StatsScreen";
import { useAuth } from "./src/store/auth";
import { palettes, useSettings } from "./src/theme";

const queryClient = new QueryClient();
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Collections" component={CollectionsScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const { user, ready, restore } = useAuth();
  const { theme, load } = useSettings();
  const p = palettes[theme];

  useEffect(() => {
    void load();
    void restore();
  }, [load, restore]);

  const navTheme = {
    ...(theme === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme === "dark" ? DarkTheme : DefaultTheme).colors,
      background: p.background,
      card: p.surface,
      text: p.text,
      border: p.border,
      primary: p.accent,
    },
  };

  return (
    <QueryClientProvider client={queryClient}>
      {!ready ? (
        <View style={{ flex: 1, justifyContent: "center", backgroundColor: p.background }}>
          <ActivityIndicator />
        </View>
      ) : user ? (
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="Reader" component={ReaderScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      ) : (
        <AuthScreen />
      )}
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
    </QueryClientProvider>
  );
}
