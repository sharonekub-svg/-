import {
  useFonts as useRubik,
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
  Rubik_900Black,
} from '@expo-google-fonts/rubik';
import { Platform } from 'react-native';

const webFont = 'Trebuchet MS, Verdana, sans-serif';

export function useAppFonts(): boolean {
  const [rubikLoaded] = useRubik({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
    Rubik_900Black,
  });
  return rubikLoaded;
}

export const fontFamily = {
  display: Platform.OS === 'web' ? webFont : 'Rubik_900Black',
  body: Platform.OS === 'web' ? webFont : 'Rubik_400Regular',
  bodyMedium: Platform.OS === 'web' ? webFont : 'Rubik_500Medium',
  bodySemi: Platform.OS === 'web' ? webFont : 'Rubik_600SemiBold',
  bodyBold: Platform.OS === 'web' ? webFont : 'Rubik_700Bold',
} as const;
