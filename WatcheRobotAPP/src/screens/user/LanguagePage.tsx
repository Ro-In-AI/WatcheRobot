import React, {useCallback, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Svg, {Circle, Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import {STORAGE_KEYS} from '../../utils/storageKeys';
import {UserSettingsHeader} from './UserSettingsHeader';

const COLORS = {
  background: '#F5F5F9',
  white: '#FFFFFF',
  black: '#000000',
  green: '#8FC31F',
  secondary: '#8E959F',
  selectedBg: '#F5F5F9',
};

const LANGUAGE_OPTIONS = [
  {id: 'zh-Hans', nativeLabel: '简体中文', englishLabel: 'Simplified Chinese'},
  {id: 'en', nativeLabel: 'English', englishLabel: 'English'},
  {id: 'ja', nativeLabel: '日本语', englishLabel: 'Japanese'},
] as const;

const CheckIcon: React.FC = () => (
  <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
    <Circle cx={16} cy={16} r={16} fill={COLORS.green} />
    <Path
      d="M10.5 16.5L14.25 20.25L21.5 13"
      stroke="#FFFFFF"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const LanguagePage: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {scaleValue, verticalScaleValue, windowWidth} = useResponsiveScale();
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      AsyncStorage.getItem(STORAGE_KEYS.userSelectedLanguage).then(value => {
        if (isMounted && value) {
          setSelectedLanguage(value);
        }
      });

      return () => {
        isMounted = false;
      };
    }, []),
  );

  const handleSelect = async (languageId: string) => {
    setSelectedLanguage(languageId);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.userSelectedLanguage, languageId);
    } catch {}
  };

  const horizontalPadding = scaleValue(20, 18, 24);
  const cardWidth = Math.min(
    windowWidth - horizontalPadding * 2,
    scaleValue(353, 333, 353),
  );
  const cardTop = verticalScaleValue(24, 20, 24);
  const cardPadding = scaleValue(16, 14, 16);
  const sectionTitleGap = verticalScaleValue(24, 20, 24);
  const rowVerticalPadding = verticalScaleValue(12, 10, 12);
  const bottomPadding = insets.bottom + verticalScaleValue(40, 32, 48);

  return (
    <View style={styles.container}>
      <UserSettingsHeader title="Language" />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: bottomPadding,
          alignItems: 'center',
        }}
        showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.card,
            {
              width: cardWidth,
              marginTop: cardTop,
              padding: cardPadding,
            },
          ]}>
          <Text style={[styles.sectionTitle, {marginBottom: sectionTitleGap}]}>
            SYSTEM LANGUAGE
          </Text>

          {LANGUAGE_OPTIONS.map(language => {
            const isSelected = selectedLanguage === language.id;

            return (
              <TouchableOpacity
                key={language.id}
                style={[
                  styles.languageRow,
                  isSelected && styles.languageRowSelected,
                  {paddingVertical: rowVerticalPadding},
                ]}
                activeOpacity={0.85}
                onPress={() => handleSelect(language.id)}>
                <View style={styles.languageTextWrap}>
                  <Text style={styles.languageNative}>{language.nativeLabel}</Text>
                  <Text style={styles.languageEnglish}>{language.englishLabel}</Text>
                </View>
                {isSelected ? <CheckIcon /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
  },
  sectionTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '500',
    color: COLORS.black,
  },
  languageRow: {
    minHeight: 72,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  languageRowSelected: {
    backgroundColor: COLORS.selectedBg,
  },
  languageTextWrap: {
    gap: 10,
  },
  languageNative: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '400',
    color: COLORS.black,
  },
  languageEnglish: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '400',
    color: COLORS.secondary,
  },
});
