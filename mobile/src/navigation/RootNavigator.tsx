import React, { useEffect, useState } from "react";
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
  Tabs,
  UtilityBriefScreen,
  RootStack,
} from "@/screens/Screens";
import { ServerWakeScreen } from "@/components/ServerWakeScreen";
import { wakeServer } from "@/lib/wakeServer";
import { useTheme } from "@/context/ThemeContext";

export type RootStackParams = RootStack;
const Stack = createNativeStackNavigator<RootStackParams>();
const TabNavigator = createBottomTabNavigator<Tabs>();

function MainTabs() {
  return (
    <TabNavigator.Navigator screenOptions={{ headerShown: false }}>
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

  if (!ready) {
    if (showWake) return <ServerWakeScreen />;
    return null;
  }
  if (!initial) return <ServerWakeScreen detail="Starting GDRPL Survey…" />;

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
      <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false }}>
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
