import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SchemeListScreen from './src/screens/SchemeListScreen';
import SchemeScreen from './src/screens/SchemeScreen';

export type RootStackParamList = {
  SchemeList: undefined;
  Scheme: { schemeId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="SchemeList">
        <Stack.Screen
          name="SchemeList"
          component={SchemeListScreen}
          options={{ title: 'Мои схемы' }}
        />
        <Stack.Screen
          name="Scheme"
          component={SchemeScreen}
          options={{ title: 'Схема разговора' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}