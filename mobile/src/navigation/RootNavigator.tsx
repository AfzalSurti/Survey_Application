import React, { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { CategoryScreen, DashboardScreen, DynamicFormScreen, LoginScreen, PreSurveyScreen, SettingsScreen, SurveyListScreen, SurveyTypeScreen, SyncScreen, Tabs } from "@/screens/Screens";
import { useTheme } from "@/context/ThemeContext";

export type RootStackParams = { Login: undefined; PreSurvey: undefined; Main: undefined; SurveyType: undefined; Category: { module: string }; DynamicForm: { module: string; category: string } };
const Stack = createNativeStackNavigator<RootStackParams>(); const TabNavigator = createBottomTabNavigator<Tabs>();
function MainTabs() {
  return <TabNavigator.Navigator screenOptions={{ headerShown: false }}><TabNavigator.Screen name="Dashboard" component={DashboardScreen} /><TabNavigator.Screen name="Surveys" component={SurveyListScreen} /><TabNavigator.Screen name="Sync" component={SyncScreen} /><TabNavigator.Screen name="Settings" component={SettingsScreen} /></TabNavigator.Navigator>;
}
export function RootNavigator() {
  const { theme } = useTheme(); const [initial, setInitial] = useState<keyof RootStackParams | null>(null);
  useEffect(() => { SecureStore.getItemAsync("access_token").then(token => setInitial(token ? "Main" : "Login")); }, []);
  if (!initial) return null;
  return <NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: theme.background, card: theme.surface, text: theme.ink, primary: theme.accentPrimary, border: theme.border, notification: theme.accentSecondary } }}><Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false }}><Stack.Screen name="Login" component={LoginScreen} /><Stack.Screen name="PreSurvey" component={PreSurveyScreen} /><Stack.Screen name="Main" component={MainTabs} /><Stack.Screen name="SurveyType" component={SurveyTypeScreen} /><Stack.Screen name="Category" component={CategoryScreen} /><Stack.Screen name="DynamicForm" component={DynamicFormScreen} /></Stack.Navigator></NavigationContainer>;
}
