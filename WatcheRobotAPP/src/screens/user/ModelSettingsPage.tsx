import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import {UserSettingsHeader} from './UserSettingsHeader';

const COLORS = {
  background: '#F5F5F9',
  white: '#FFFFFF',
  black: '#000000',
  placeholder: '#8E959F',
  inputBg: '#F5F5F9',
};

const INPUTS = [
  {key: 'apiKey', label: 'API Key'},
  {key: 'requestAddress', label: 'Request Address'},
  {key: 'modelName', label: 'Model Name'},
] as const;

export const ModelSettingsPage: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {scaleValue, verticalScaleValue, windowWidth} = useResponsiveScale();
  const [apiKey, setApiKey] = useState('');
  const [requestAddress, setRequestAddress] = useState('');
  const [modelName, setModelName] = useState('');

  const values = {
    apiKey,
    requestAddress,
    modelName,
  };

  const setters = {
    apiKey: setApiKey,
    requestAddress: setRequestAddress,
    modelName: setModelName,
  };

  const horizontalPadding = scaleValue(20, 18, 24);
  const cardWidth = Math.min(
    windowWidth - horizontalPadding * 2,
    scaleValue(353, 333, 353),
  );
  const cardTop = verticalScaleValue(24, 20, 24);
  const cardPadding = scaleValue(16, 14, 16);
  const fieldGap = verticalScaleValue(32, 28, 32);
  const labelGap = verticalScaleValue(16, 14, 16);
  const inputHeight = verticalScaleValue(44, 42, 44);
  const bottomPadding = insets.bottom + verticalScaleValue(40, 32, 48);

  return (
    <View style={styles.container}>
      <UserSettingsHeader title="Model settings" />
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
              paddingHorizontal: cardPadding,
              paddingVertical: verticalScaleValue(30, 26, 30),
              gap: fieldGap,
            },
          ]}>
          {INPUTS.map(input => (
            <View key={input.key} style={{gap: labelGap}}>
              <Text style={styles.label}>{input.label}</Text>
              <TextInput
                value={values[input.key]}
                onChangeText={setters[input.key]}
                placeholder="Please enter"
                placeholderTextColor={COLORS.placeholder}
                style={[styles.input, {height: inputHeight}]}
              />
            </View>
          ))}
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
  label: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '400',
    color: COLORS.black,
  },
  input: {
    borderRadius: 8,
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 16,
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '400',
    color: COLORS.black,
  },
});
