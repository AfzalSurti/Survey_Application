import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import * as SecureStore from "expo-secure-store";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  CategoryScreen,
  CompanyIntroScreen,
  DashboardScreen,
  DynamicFormScreen,
  LoginScreen,
  PreSurveyScreen,
  SettingsScreen,
  StructureBriefScreen,
  SurveyListScreen,
  SurveyTypeScreen,
  SyncScreen,
  UtilityBriefScreen,
  RootStack,
  Tabs,
} from "@/screens/Screens";
import { ServerWakeScreen } from "@/components/ServerWakeScreen";
import { wakeServer } from "@/lib/wakeServer";
import { useTheme } from "@/context/ThemeContext";

export type RootStackParams = RootStack;
const Stack = createNativeStackNavigator<RootStackParams>();
const TabNavigator = createBottomTabNavigator<Tabs>();

function TabIcon({ label, focused, color }: { label: string; focused: boolean; color: string }) {
  const mark = label === "Dashboard" ? "⌂" : label === "Surveys" ? "☰" : label === "Sync" ? "↻" : "⚙";
  return (
    <Text style={{ color, fontSize: focused ? 18 : 16, fontWeight: focused ? "800" : "600", marginTop: 2 }}>
      {mark}
    </Text>
  );
}

function MainTabs() {
  const { theme } = useTheme();
  return (
    <TabNavigator.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.accentPrimary,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarIcon: ({ focused, color }) => <TabIcon label={route.name} focused={focused} color={color} />,
      })}
    >
      <TabNavigator.Screen name="Dashboard" component={DashboardScreen} />
      <TabNavigator.Screen name="Surveys" component={SurveyListScreen} />
      <TabNavigator.Screen name="Sync" component={SyncScreen} />
      <TabNavigator.Screen name="Settings" component={SettingsScreen} />
    </TabNavigator.Navigator>
  );
}

export function RootNavigator() {
  const { theme } = useTheme();
  const [initial, setInitial] = useState<keyof RootStackParams | null>(null);
  const [ready, setReady] = useState(false);
  const [showWake, setShowWake] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await SecureStore.getItemAsync("access_token");
      if (!cancelled) setInitial(token ? "Main" : "Login");
      setShowWake(true);
      await wakeServer({
        onSlow: () => {
          if (!cancelled) setShowWake(true);
        },
      });
      if (!cancelled) {
        setShowWake(false);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready || !initial) {
    return <ServerWakeScreen detail={showWake ? undefined : "Starting GDRPL Survey…"} />;
  }

  return (
    <NavigationContainer
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: theme.background,
          card: theme.surface,
          text: theme.ink,
          primary: theme.accentPrimary,
          border: theme.border,
          notification: theme.accentSecondary,
        },
      }}
    >
      <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="CompanyIntro" component={CompanyIntroScreen} />
        <Stack.Screen name="SurveyType" component={SurveyTypeScreen} />
        <Stack.Screen name="StructureBrief" component={StructureBriefScreen} />
        <Stack.Screen name="UtilityBrief" component={UtilityBriefScreen} />
        <Stack.Screen name="PreSurvey" component={PreSurveyScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Category" component={CategoryScreen} />
        <Stack.Screen name="DynamicForm" component={DynamicFormScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
