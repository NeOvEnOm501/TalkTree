import AsyncStorage from '@react-native-async-storage/async-storage';
import { IScheme } from './types';

const STORAGE_KEY = '@talktree_schemes';

export async function getSchemes(): Promise<IScheme[]> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json !== null) {
      return JSON.parse(json) as IScheme[];
    }
    return [];
  } catch (e) {
    console.error('Failed to load schemes', e);
    return [];
  }
}

export async function saveSchemes(schemes: IScheme[]): Promise<void> {
  try {
    const json = JSON.stringify(schemes);
    await AsyncStorage.setItem(STORAGE_KEY, json);
  } catch (e) {
    console.error('Failed to save schemes', e);
  }
}