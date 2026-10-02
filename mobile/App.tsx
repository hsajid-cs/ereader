import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import AuthScreen from "./src/screens/AuthScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import { useAuth } from "./src/store/auth";

const queryClient = new QueryClient();

export default function App() {
  const { user, ready, restore } = useAuth();

  useEffect(() => {
    void restore();
  }, [restore]);

  return (
    <QueryClientProvider client={queryClient}>
      {!ready ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      ) : user ? (
        <LibraryScreen />
      ) : (
        <AuthScreen />
      )}
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
