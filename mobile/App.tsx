import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initDb } from "@/db";
import { ThemeProvider } from "@/context/ThemeContext";
import { RootNavigator } from "@/navigation/RootNavigator";
import { registerSyncListener, syncPending } from "@/sync/engine";

export default function App() {
  useEffect(() => {
    void (async () => {
      await initDb();
      // Push any offline submissions as soon as the app starts with network.
      void syncPending();
    })();
    const unsubscribe = registerSyncListener();
    return unsubscribe;
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
