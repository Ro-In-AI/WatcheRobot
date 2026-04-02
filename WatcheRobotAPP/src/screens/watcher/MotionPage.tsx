import React, {useCallback, useState} from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {
  BluetoothStatus,
  useBluetooth,
} from '../../modules/bluetooth';
import type {WatcherStackParamList} from '../../navigation/AppNavigator';
import {WatcherHeader} from '../../components/WatcherHeader';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import {toAiStatusPayload, WATCHER_ACTION_ITEMS} from './watcherActionItems';
import {useDirectionalServoControl} from './useDirectionalServoControl';

const COLORS = {
  background: '#F5F5F9',
  white: '#FFFFFF',
  black: '#000000',
  secondary: '#8E959F',
  green: '#8FC31F',
  greenDark: '#77C320',
  lightRing: '#EEF0F5',
  divider: '#EEF0F3',
};

const ROBOT_IMAGE =
  'https://www.figma.com/api/mcp/asset/5fdd0947-93dc-47a3-855c-8261f368c503';

type MotionNavigationProp = NativeStackNavigationProp<WatcherStackParamList>;

type ArrowIconProps = {
  direction: 'up' | 'right' | 'down' | 'left';
  active?: boolean;
};

const ArrowIcon: React.FC<ArrowIconProps> = ({
  direction,
  active = false,
}) => {
  const rotation = {
    up: '0deg',
    right: '90deg',
    down: '180deg',
    left: '270deg',
  } as const;

  return (
    <Svg
      width={35}
      height={35}
      viewBox="0 0 28 28"
      style={{
        transform: [{rotate: rotation[direction]}, {scale: active ? 1.08 : 1}],
      }}>
      <Path
        d="M14.4301 2.44547C14.6624 2.04312 15.2432 2.04312 15.4756 2.44547L21.2187 12.3933C21.451 12.7956 21.1608 13.2985 20.6969 13.2985H9.2088C8.74494 13.2985 8.45467 12.7956 8.687 12.3933L14.4301 2.44547Z"
        fill={active ? COLORS.greenDark : COLORS.green}
      />
    </Svg>
  );
};

export const MotionPage: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {windowWidth, scaleValue, verticalScaleValue} = useResponsiveScale();
  const navigation = useNavigation<MotionNavigationProp>();
  const {status, sendServoAngle, sendAiStatus} = useBluetooth();
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [pressedDirection, setPressedDirection] = useState<
    'up' | 'right' | 'down' | 'left' | null
  >(null);
  const isConnected = status === BluetoothStatus.Connected;

  const {startDirectionalMove, stopDirectionalMove} = useDirectionalServoControl(
    {
      isConnected,
      sendServoAngle,
    },
  );

  const handleActionPress = useCallback(
    async (itemId: string) => {
      const item = WATCHER_ACTION_ITEMS.find(nextItem => nextItem.id === itemId);
      if (!item) {
        return;
      }

      setSelectedItem(current => (current === itemId ? null : itemId));

      if (!isConnected) {
        return;
      }

      try {
        await sendAiStatus(toAiStatusPayload(item));
      } catch {
        // Keep the UI responsive even if BLE rejects the action.
      }
    },
    [isConnected, sendAiStatus],
  );

  const horizontalPadding = scaleValue(20, 18, 24);
  const headerSideInset = scaleValue(30, 26, 32);
  const contentWidth = windowWidth - horizontalPadding * 2;
  const robotTop = verticalScaleValue(24, 20, 28);
  const robotBottom = verticalScaleValue(17, 14, 22);
  const robotWidth = Math.min(scaleValue(171, 158, 182), contentWidth * 0.52);
  const robotHeight = Math.min(scaleValue(196, 182, 210), contentWidth * 0.6);
  const cardTopPadding = verticalScaleValue(20, 18, 24);
  const joystickTop = verticalScaleValue(24, 20, 28);
  const joystickBottom = verticalScaleValue(20, 16, 24);
  const joystickShellSize = 185;
  const joystickCenterOuterSize = joystickShellSize * (79 / 185);
  const joystickCenterRingSize = joystickShellSize * (51.12 / 185);
  const danceTop = verticalScaleValue(16, 14, 18);
  const gridBottomPadding = insets.bottom + verticalScaleValue(16, 12, 22);
  const gridImageSize = Math.min(
    scaleValue(85, 76, 88),
    (contentWidth - 32) / 3 - scaleValue(12, 10, 16),
  );
  const directionButtonSize = 42;
  const joystickOuterRadius = joystickShellSize / 2;
  const joystickGrayRadius = joystickCenterOuterSize / 2;
  const directionTrackRadius =
    joystickGrayRadius + (joystickOuterRadius - joystickGrayRadius) * 0.35;
  const directionCrossAxisOffset =
    joystickOuterRadius - directionButtonSize / 2;
  const directionPositions = {
    up: {
      top: joystickOuterRadius - directionButtonSize / 2 - directionTrackRadius,
      left: directionCrossAxisOffset,
    },
    right: {
      right:
        joystickOuterRadius - directionButtonSize / 2 - directionTrackRadius,
      top: directionCrossAxisOffset,
    },
    down: {
      bottom:
        joystickOuterRadius - directionButtonSize / 2 - directionTrackRadius,
      left: directionCrossAxisOffset,
    },
    left: {
      left: joystickOuterRadius - directionButtonSize / 2 - directionTrackRadius,
      top: directionCrossAxisOffset,
    },
  } as const;

  return (
    <View style={styles.container}>
      <View style={{height: insets.top, backgroundColor: COLORS.background}} />

      <WatcherHeader
        title="Motion"
        onBack={() => navigation.goBack()}
        sideInset={headerSideInset}
        backgroundColor={COLORS.background}
      />

      <View style={styles.content}>
        <View
          style={[
            styles.robotSection,
            {
              width: contentWidth,
              marginTop: robotTop,
              marginBottom: robotBottom,
            },
          ]}>
          <Image
            source={{uri: ROBOT_IMAGE}}
            style={[styles.robotImage, {width: robotWidth, height: robotHeight}]}
            resizeMode="contain"
          />
        </View>

        <View
          style={[
            styles.card,
            {
              width: contentWidth,
              paddingTop: cardTopPadding,
            },
          ]}>
          <Text style={styles.sectionTitle}>Joystick</Text>

          <View
            style={[
              styles.joystickSection,
              {paddingTop: joystickTop, paddingBottom: joystickBottom},
            ]}>
            <View
              style={[
                styles.joystickShell,
                {
                  width: joystickShellSize,
                  height: joystickShellSize,
                  borderRadius: joystickShellSize / 2,
                },
              ]}>
              <View style={styles.joystickBase} />
              <TouchableOpacity
                testID="motion-direction-up"
                activeOpacity={0.75}
                disabled={!isConnected}
                hitSlop={8}
                onPressIn={() => {
                  setPressedDirection('up');
                  startDirectionalMove('y', 10).catch(() => undefined);
                }}
                onPressOut={() => {
                  setPressedDirection(null);
                  stopDirectionalMove('y');
                }}
                style={[
                  styles.directionTouchArea,
                  directionPositions.up,
                  {
                    width: directionButtonSize,
                    height: directionButtonSize,
                    borderRadius: directionButtonSize / 2,
                  },
                  pressedDirection === 'up' && styles.directionTouchAreaActive,
                ]}>
                <ArrowIcon
                  direction="up"
                  active={pressedDirection === 'up'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                testID="motion-direction-right"
                activeOpacity={0.75}
                disabled={!isConnected}
                hitSlop={8}
                onPressIn={() => {
                  setPressedDirection('right');
                  startDirectionalMove('x', 10).catch(() => undefined);
                }}
                onPressOut={() => {
                  setPressedDirection(null);
                  stopDirectionalMove('x');
                }}
                style={[
                  styles.directionTouchArea,
                  directionPositions.right,
                  {
                    width: directionButtonSize,
                    height: directionButtonSize,
                    borderRadius: directionButtonSize / 2,
                  },
                  pressedDirection === 'right' && styles.directionTouchAreaActive,
                ]}>
                <ArrowIcon
                  direction="right"
                  active={pressedDirection === 'right'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                testID="motion-direction-down"
                activeOpacity={0.75}
                disabled={!isConnected}
                hitSlop={8}
                onPressIn={() => {
                  setPressedDirection('down');
                  startDirectionalMove('y', -10).catch(() => undefined);
                }}
                onPressOut={() => {
                  setPressedDirection(null);
                  stopDirectionalMove('y');
                }}
                style={[
                  styles.directionTouchArea,
                  directionPositions.down,
                  {
                    width: directionButtonSize,
                    height: directionButtonSize,
                    borderRadius: directionButtonSize / 2,
                  },
                  pressedDirection === 'down' && styles.directionTouchAreaActive,
                ]}>
                <ArrowIcon
                  direction="down"
                  active={pressedDirection === 'down'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                testID="motion-direction-left"
                activeOpacity={0.75}
                disabled={!isConnected}
                hitSlop={8}
                onPressIn={() => {
                  setPressedDirection('left');
                  startDirectionalMove('x', -10).catch(() => undefined);
                }}
                onPressOut={() => {
                  setPressedDirection(null);
                  stopDirectionalMove('x');
                }}
                style={[
                  styles.directionTouchArea,
                  directionPositions.left,
                  {
                    width: directionButtonSize,
                    height: directionButtonSize,
                    borderRadius: directionButtonSize / 2,
                  },
                  pressedDirection === 'left' && styles.directionTouchAreaActive,
                ]}>
                <ArrowIcon
                  direction="left"
                  active={pressedDirection === 'left'}
                />
              </TouchableOpacity>
              <View
                style={[
                  styles.joystickCenterOuter,
                  {
                    width: joystickCenterOuterSize,
                    height: joystickCenterOuterSize,
                    borderRadius: joystickCenterOuterSize / 2,
                  },
                ]}>
                <View
                  style={[
                    styles.joystickCenterRing,
                    {
                      width: joystickCenterRingSize,
                      height: joystickCenterRingSize,
                      borderRadius: joystickCenterRingSize / 2,
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.danceSection}>
            <Text style={[styles.danceTitle, {marginBottom: danceTop}]}>
              Dance
            </Text>

            <ScrollView
              style={styles.danceScroll}
              contentContainerStyle={[
                styles.grid,
                {paddingBottom: gridBottomPadding},
              ]}
              showsVerticalScrollIndicator={false}>
              {WATCHER_ACTION_ITEMS.map(item => (
                <TouchableOpacity
                  key={item.id}
                  testID={`motion-action-${item.id}`}
                  style={[
                    styles.gridItem,
                    selectedItem === item.id && styles.gridItemActive,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => {
                    handleActionPress(item.id).catch(() => undefined);
                  }}>
                  <Image
                    source={item.imageSource}
                    style={[
                      styles.gridImage,
                      {width: gridImageSize, height: gridImageSize},
                    ]}
                    resizeMode="contain"
                  />
                  <Text
                    style={styles.gridLabel}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  robotSection: {
    alignItems: 'center',
  },
  robotImage: {
    alignSelf: 'center',
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: COLORS.secondary,
  },
  joystickSection: {
    width: '100%',
    alignItems: 'center',
  },
  joystickShell: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  joystickBase: {
    position: 'absolute',
    inset: 0,
    borderRadius: 999,
    backgroundColor: COLORS.white,
    shadowColor: '#CFCFD7',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 4,
  },
  directionTouchArea: {
    position: 'absolute',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  directionTouchAreaActive: {
    backgroundColor: 'rgba(143, 195, 31, 0.12)',
  },
  joystickCenterOuter: {
    backgroundColor: COLORS.lightRing,
    justifyContent: 'center',
    alignItems: 'center',
  },
  joystickCenterRing: {
    borderWidth: 8,
    borderColor: COLORS.green,
    backgroundColor: 'transparent',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: COLORS.divider,
  },
  danceSection: {
    flex: 1,
    width: '100%',
    paddingTop: 16,
  },
  danceTitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: COLORS.secondary,
  },
  danceScroll: {
    flex: 1,
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 0,
  },
  gridItem: {
    width: '33.3333%',
    alignItems: 'center',
    borderRadius: 12,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 8,
  },
  gridItemActive: {
    backgroundColor: '#F3F5F8',
  },
  gridImage: {
    marginBottom: 12,
  },
  gridLabel: {
    width: '100%',
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '400',
    color: COLORS.black,
    textAlign: 'center',
  },
});
