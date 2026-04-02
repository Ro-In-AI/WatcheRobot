import React, {useState} from 'react';
import {ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import {UserSettingsHeader} from './UserSettingsHeader';

const COLORS = {
  background: '#FFFFFF',
  white: '#FFFFFF',
  black: '#000000',
  secondary: '#8E959F',
  green: '#8FC31F',
  chevron: '#D5D7DD',
  switchOff: '#E6E6E6',
};

const ChevronRightIcon: React.FC = () => (
  <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
    <Path
      d="M4.25 2.25L7.75 6L4.25 9.75"
      stroke={COLORS.chevron}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const PrivacySettingsPage: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {scaleValue, verticalScaleValue, windowWidth} = useResponsiveScale();
  const [privacyModeEnabled, setPrivacyModeEnabled] = useState(false);
  const [visibilityEnabled, setVisibilityEnabled] = useState(true);
  const [filteringEnabled, setFilteringEnabled] = useState(true);

  const horizontalPadding = scaleValue(20, 18, 24);
  const contentWidth = Math.min(
    windowWidth - horizontalPadding * 2,
    scaleValue(353, 333, 353),
  );
  const sectionTop = verticalScaleValue(24, 20, 24);
  const itemGap = verticalScaleValue(22, 20, 24);
  const descTop = verticalScaleValue(12, 10, 12);
  const bottomPadding = insets.bottom + verticalScaleValue(40, 32, 48);

  return (
    <View style={styles.container}>
      <UserSettingsHeader title="Privacy Settings" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: horizontalPadding,
          paddingTop: sectionTop,
          paddingBottom: bottomPadding,
          alignItems: 'center',
        }}
        showsVerticalScrollIndicator={false}>
        <View style={{width: contentWidth, gap: itemGap}}>
          <TouchableOpacity activeOpacity={0.85} style={styles.row}>
            <Text style={styles.rowTitle}>Access rights</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>Everyone</Text>
              <ChevronRightIcon />
            </View>
          </TouchableOpacity>

          <View style={styles.settingBlock}>
            <View style={styles.row}>
              <Text style={styles.rowTitle}>Privacy Mode</Text>
              <Switch
                value={privacyModeEnabled}
                onValueChange={setPrivacyModeEnabled}
                trackColor={{false: COLORS.switchOff, true: COLORS.green}}
                thumbColor={COLORS.white}
                ios_backgroundColor={COLORS.switchOff}
              />
            </View>
            <Text style={[styles.rowDescription, {marginTop: descTop}]}>
              After activation, the Watcher blocks the camera from uploading,
              preventing visitors from viewing the surveillance footage.
            </Text>
          </View>

          <View style={styles.settingBlock}>
            <View style={styles.row}>
              <Text style={styles.rowTitle}>Visibility control</Text>
              <Switch
                value={visibilityEnabled}
                onValueChange={setVisibilityEnabled}
                trackColor={{false: COLORS.switchOff, true: COLORS.green}}
                thumbColor={COLORS.white}
                ios_backgroundColor={COLORS.switchOff}
              />
            </View>
            <Text style={[styles.rowDescription, {marginTop: descTop}]}>
              Whether to allow one's own crayfish to appear in the "Nearby"
              discovery radar.
            </Text>
          </View>

          <View style={styles.settingBlock}>
            <View style={styles.row}>
              <Text style={styles.rowTitle}>
                Automatic desensitization filtering
              </Text>
              <Switch
                value={filteringEnabled}
                onValueChange={setFilteringEnabled}
                trackColor={{false: COLORS.switchOff, true: COLORS.green}}
                thumbColor={COLORS.white}
                ios_backgroundColor={COLORS.switchOff}
              />
            </View>
            <Text style={[styles.rowDescription, {marginTop: descTop}]}>
              Activate the core security mechanism. All content published by the
              owner must undergo model filtering before being released.
            </Text>
          </View>
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
  row: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowTitle: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '400',
    color: COLORS.black,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValue: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 14,
    fontWeight: '400',
    color: '#636A74',
  },
  settingBlock: {
    gap: 0,
  },
  rowDescription: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
    color: COLORS.secondary,
  },
});
