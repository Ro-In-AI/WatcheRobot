import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';

const COLORS = {
  white: '#FFFFFF',
  black: '#000000',
};

const BackIcon: React.FC = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M15.5 19.5L8.5 12L15.5 4.5"
      stroke="#000000"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

type Props = {
  title: string;
};

export const UserSettingsHeader: React.FC<Props> = ({title}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {scaleValue, verticalScaleValue} = useResponsiveScale();
  const sideInset = scaleValue(30, 24, 30);
  const topPadding = verticalScaleValue(10, 8, 10);

  return (
    <View style={[styles.wrapper, {paddingTop: insets.top, backgroundColor: COLORS.white}]}>
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: sideInset,
            paddingTop: topPadding,
            paddingBottom: topPadding,
          },
        ]}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.8}
          onPress={() => navigation.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: COLORS.white,
  },
  header: {
    height: 44,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 30,
    top: 10,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  title: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '500',
    color: COLORS.black,
    textAlign: 'center',
  },
});
