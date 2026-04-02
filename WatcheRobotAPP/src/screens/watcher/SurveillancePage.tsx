import React, {useCallback, useEffect, useState} from 'react';
import {
  Image,
  ImageBackground,
  LayoutAnimation,
  LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {
  BluetoothStatus,
  useBluetooth,
} from '../../modules/bluetooth';
import {WatcherHeader} from '../../components/WatcherHeader';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import {
  toAiStatusPayload,
  WATCHER_ACTION_ITEMS,
} from './watcherActionItems';
import {useDirectionalServoControl} from './useDirectionalServoControl';

const COLORS = {
  background: '#F2F2F7',
  white: '#FFFFFF',
  black: '#000000',
  green: '#8FC31F',
  lightRing: '#E9E9F2',
  cameraFallback: '#D7D8DE',
};

const CAMERA_IMAGE =
  'https://www.figma.com/api/mcp/asset/9d5536a5-8474-482b-bb63-2da71cd53257';
const FIGMA_BOTTOM_AREA_HEIGHT = 479;
const BOTTOM_SHEET_HEIGHT = 188;
const FIGMA_OPEN_CONTROLS_BOTTOM = 203;
const CLOSED_CONTROLS_BOTTOM = 28;

const IconCircle: React.FC<{children: React.ReactNode}> = ({children}) => (
  <View style={styles.iconCircle}>{children}</View>
);

const MicrophoneIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
    <Path
      d="M11 14.3C8.7 14.3 6.8 12.4 6.8 10.1V4.8C6.8 2.5 8.7 0.6 11 0.6C13.3 0.6 15.2 2.5 15.2 4.8V10.1C15.2 12.4 13.3 14.3 11 14.3Z"
      fill="#020202"
    />
    <Path
      d="M18.4 10.6C17.9 10.6 17.5 11 17.5 11.5V12.2C17.5 15.3 15 17.8 11.9 17.8H10.1C7 17.8 4.5 15.3 4.5 12.2V11.5C4.5 11 4.1 10.6 3.6 10.6C3.1 10.6 2.7 11 2.7 11.5V12.2C2.7 16 5.5 19.1 9 19.4V21.1H6.3C5.8 21.1 5.4 21.5 5.4 22H16.6C16.6 21.5 16.2 21.1 15.7 21.1H13V19.4C16.5 19.1 19.3 16 19.3 12.2V11.5C19.3 11 18.9 10.6 18.4 10.6Z"
      fill="#020202"
    />
  </Svg>
);

const MutedMicrophoneIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
    <Path
      d="M18.4 10.6C18.9 10.6 19.3 11 19.3 11.5V12.2C19.3 16 16.5 19.1 13 19.4V21.1H15.7C16.2 21.1 16.6 21.5 16.6 22H5.4C5.4 21.5 5.8 21.1 6.3 21.1H9V19.4C7.8 19.3 6.8 18.9 5.8 18.3L7.3 16.8C8.3 17.4 9.1 17.8 10.1 17.8H11.9C15 17.8 17.5 15.3 17.5 12.2V11.5C17.5 11 17.9 10.6 18.4 10.6Z"
      fill="#020202"
    />
    <Path
      d="M15.2 10.1C15.2 12.4 13.3 14.3 11 14.3C10.2 14.3 9.5 14.1 8.8 13.8L10.4 12.2C10.6 12.3 10.8 12.4 11 12.4C12.3 12.4 13.3 11.4 13.3 10.1V8.9L15.2 7V10.1ZM11 0.6C13.3 0.6 15.2 2.5 15.2 4.8V5L13.3 6.9V4.8C13.3 3.5 12.3 2.5 11 2.5C9.7 2.5 8.7 3.5 8.7 4.8V10.1C8.7 10.7 8.9 11.2 9.2 11.6L7.8 13C7 12.1 6.8 11.2 6.8 10.1V4.8C6.8 2.5 8.7 0.6 11 0.6Z"
      fill="#020202"
    />
    <Path
      d="M18.9 1.1L2.4 17.6"
      stroke="#020202"
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
);

const FaceIcon: React.FC<{color?: string}> = ({color = '#0D0D0D'}) => (
  <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
    <Path
      d="M25.3 29.3H6.7C5.2 29.3 4 28.1 4 26.7V20C4 19.3 4.6 18.7 5.3 18.7C6.1 18.7 6.7 19.3 6.7 20V25.3C6.7 26 7.3 26.7 8 26.7H24C24.7 26.7 25.3 26 25.3 25.3V20C25.3 19.3 25.9 18.7 26.7 18.7C27.4 18.7 28 19.3 28 20V26.7C28 28.1 26.8 29.3 25.3 29.3ZM12.7 14.7C11.6 14.7 10.7 13.8 10.7 12.7C10.7 11.6 11.6 10.7 12.7 10.7C13.8 10.7 14.7 11.6 14.7 12.7C14.7 13.8 13.8 14.7 12.7 14.7ZM19.3 14.7C18.2 14.7 17.3 13.8 17.3 12.7C17.3 11.6 18.2 10.7 19.3 10.7C20.4 10.7 21.3 11.6 21.3 12.7C21.3 13.8 20.4 14.7 19.3 14.7ZM16 2.7C9.4 2.7 4 8.1 4 14.7C4 15.4 4.6 16 5.3 16C6.1 16 6.7 15.4 6.7 14.7C6.7 9.5 10.8 5.3 16 5.3C21.2 5.3 25.3 9.5 25.3 14.7C25.3 15.4 25.9 16 26.7 16C27.4 16 28 15.4 28 14.7C28 8.1 22.6 2.7 16 2.7Z"
      fill={color}
    />
  </Svg>
);

const SpeakerIcon = () => (
  <Svg width={21} height={17} viewBox="0 0 21 17" fill="none">
    <Path
      d="M9 1L4.5 4H2.3C1 4 0 5 0 6.3V10.7C0 12 1 13 2.3 13H4.5L9 16C10.5 17 12.5 16 12.7 14.2C13 10.1 13 6 12.7 1.8C12.5 0 10.5 -1 9 1ZM18.8 3C19.7 4.6 20.1 6.3 20.1 8.1C20.1 9.8 19.7 11.6 18.8 13.1M16.1 5C16.6 5.9 16.9 7 16.9 8.1C16.9 9.1 16.6 10.2 16.1 11.1"
      stroke="#000000"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const ExpandIcon = () => (
  <IconCircle>
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Path
        d="M5.1 6.4L0.8 10.8M4.2 11.2H0.8V7.8M8.9 7.6L13.2 3.2M9.8 2.8H13.2V6.2"
        stroke="#000000"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  </IconCircle>
);

const Arrow: React.FC<{
  direction: 'up' | 'right' | 'down' | 'left';
  compact?: boolean;
  compactScale?: number;
  shellSize: number;
  disabled?: boolean;
  onPressIn?: () => void;
  onPressOut?: () => void;
}> = ({
  direction,
  compact = false,
  compactScale = 1,
  shellSize,
  disabled = false,
  onPressIn,
  onPressOut,
}) => {
  const centerOuterSize = shellSize * (79 / 185);
  const directionButtonSize = compact ? Math.round(34 * compactScale) : 42;
  const iconSize = compact ? Math.round(28 * compactScale) : 35;
  const shellRadius = shellSize / 2;
  const centerRadius = centerOuterSize / 2;
  const directionTrackRadius =
    centerRadius + (shellRadius - centerRadius) * (compact ? 0.42 : 0.35);
  const crossAxisOffset = shellRadius - directionButtonSize / 2;
  const edgeOffset = shellRadius - directionButtonSize / 2 - directionTrackRadius;
  const rotations = {
    up: '0deg',
    right: '90deg',
    down: '180deg',
    left: '270deg',
  } as const;
  const positions = {
    up: {top: edgeOffset, left: crossAxisOffset},
    right: {right: edgeOffset, top: crossAxisOffset},
    down: {bottom: edgeOffset, left: crossAxisOffset},
    left: {left: edgeOffset, top: crossAxisOffset},
  } as const;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.arrowWrapper,
        positions[direction],
        {
          width: directionButtonSize,
          height: directionButtonSize,
          borderRadius: directionButtonSize / 2,
        },
        {transform: [{rotate: rotations[direction]}]},
      ]}>
      <Svg width={iconSize} height={iconSize} viewBox="0 0 28 28" fill="none">
        <Path
          d="M14.4301 2.44547C14.6624 2.04312 15.2432 2.04312 15.4756 2.44547L21.2187 12.3933C21.451 12.7956 21.1608 13.2985 20.6969 13.2985H9.2088C8.74494 13.2985 8.45467 12.7956 8.687 12.3933L14.4301 2.44547Z"
          fill={COLORS.green}
        />
      </Svg>
    </TouchableOpacity>
  );
};

const JoystickPad: React.FC<{
  compact?: boolean;
  compactScale?: number;
  shellSize: number;
  disabled?: boolean;
  onArrowPressIn: (axis: 'x' | 'y', delta: number) => void;
  onArrowPressOut: (axis: 'x' | 'y') => void;
}> = ({
  compact = false,
  compactScale = 1,
  shellSize,
  disabled = false,
  onArrowPressIn,
  onArrowPressOut,
}) => {
  const currentShellSize = compact
    ? Math.round(150 * compactScale)
    : shellSize;
  const currentRadius = Math.round(currentShellSize / 2);
  const currentCenterSize = Math.round(currentShellSize * (79 / 185));
  const currentCenterRadius = Math.round(currentCenterSize / 2);
  const currentRingSize = Math.round(currentShellSize * (51.12 / 185));
  const currentRingRadius = Math.round(currentRingSize / 2);
  const currentRingBorderWidth = Math.max(
    6,
    Math.round(currentShellSize * (8 / 185)),
  );

  return (
    <View
      style={[
        styles.joystickShell,
        {
          width: currentShellSize,
          height: currentShellSize,
          borderRadius: currentRadius,
        },
      ]}>
      <Arrow
        direction="up"
        compact={compact}
        compactScale={compactScale}
        shellSize={currentShellSize}
        disabled={disabled}
        onPressIn={() => onArrowPressIn('y', 10)}
        onPressOut={() => onArrowPressOut('y')}
      />
      <Arrow
        direction="right"
        compact={compact}
        compactScale={compactScale}
        shellSize={currentShellSize}
        disabled={disabled}
        onPressIn={() => onArrowPressIn('x', 10)}
        onPressOut={() => onArrowPressOut('x')}
      />
      <Arrow
        direction="down"
        compact={compact}
        compactScale={compactScale}
        shellSize={currentShellSize}
        disabled={disabled}
        onPressIn={() => onArrowPressIn('y', -10)}
        onPressOut={() => onArrowPressOut('y')}
      />
      <Arrow
        direction="left"
        compact={compact}
        compactScale={compactScale}
        shellSize={currentShellSize}
        disabled={disabled}
        onPressIn={() => onArrowPressIn('x', -10)}
        onPressOut={() => onArrowPressOut('x')}
      />

      <View
        style={[
          styles.centerOuterCircle,
          {
            width: currentCenterSize,
            height: currentCenterSize,
            borderRadius: currentCenterRadius,
          },
        ]}>
        <View
          style={[
            styles.centerRing,
            {
              width: currentRingSize,
              height: currentRingSize,
              borderRadius: currentRingRadius,
              borderWidth: currentRingBorderWidth,
            },
          ]}
        />
      </View>
    </View>
  );
};

export const SurveillancePage: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {windowWidth, heightScale, scaleValue, verticalScaleValue} =
    useResponsiveScale();
  const navigation = useNavigation();
  const {status, sendServoAngle, sendAiStatus} = useBluetooth();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [selectedOtherId, setSelectedOtherId] = useState<string | null>(null);
  const [bottomAreaHeight, setBottomAreaHeight] = useState(
    FIGMA_BOTTOM_AREA_HEIGHT,
  );
  const isConnected = status === BluetoothStatus.Connected;
  const {startDirectionalMove, stopDirectionalMove} = useDirectionalServoControl({
    isConnected,
    sendServoAngle,
  });

  const headerSideInset = scaleValue(30, 26, 32);
  const horizontalPadding = scaleValue(20, 18, 24);
  const cameraHeight = verticalScaleValue(273, 248, 292);
  const closedJoystickSize = Math.min(
    scaleValue(250, 224, 268),
    windowWidth * 0.64,
  );
  const closedJoystickPaddingTop = verticalScaleValue(34, 28, 40);
  const bottomAreaScale = Math.min(
    Math.max((bottomAreaHeight / FIGMA_BOTTOM_AREA_HEIGHT) * heightScale, 0.92),
    1.08,
  );
  const openSheetHeight = Math.round(BOTTOM_SHEET_HEIGHT * bottomAreaScale);
  const openControlsBottom = Math.round(
    FIGMA_OPEN_CONTROLS_BOTTOM * bottomAreaScale,
  );
  const openJoystickPaddingTop = Math.round(
    verticalScaleValue(32, 26, 36) * bottomAreaScale,
  );
  const compactJoystickScale = Math.min(Math.max(bottomAreaScale, 0.94), 1.06);
  const joystickShellSize = isPanelOpen
    ? Math.round(150 * compactJoystickScale)
    : closedJoystickSize;
  const closedControlsBottom =
    insets.bottom + verticalScaleValue(CLOSED_CONTROLS_BOTTOM, 24, 34);
  const expandRight = scaleValue(36, 28, 38);
  const expandBottom = verticalScaleValue(16, 12, 20);
  const otherImageSize = scaleValue(85, 76, 88);

  const handleBottomAreaLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (nextHeight > 0 && nextHeight !== bottomAreaHeight) {
      setBottomAreaHeight(nextHeight);
    }
  };

  useEffect(() => {
    if (
      Platform.OS === 'android' &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const handleTogglePanel = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsPanelOpen(value => !value);
  };

  const handleOtherActionPress = useCallback(
    async (itemId: string) => {
      const item = WATCHER_ACTION_ITEMS.find(nextItem => nextItem.id === itemId);
      if (!item) {
        return;
      }

      setSelectedOtherId(itemId);

      if (!isConnected) {
        return;
      }

      try {
        await sendAiStatus(toAiStatusPayload(item));
      } catch {
        // Ignore transient BLE failures and keep the UI interactive.
      }
    },
    [isConnected, sendAiStatus],
  );

  return (
    <View style={styles.container}>
      <View style={{height: insets.top, backgroundColor: COLORS.white}} />
      <WatcherHeader
        title="Surveillance"
        onBack={() => navigation.goBack()}
        sideInset={headerSideInset}
      />

      <ImageBackground
        source={{uri: CAMERA_IMAGE}}
        style={[styles.cameraContainer, {height: cameraHeight}]}
        imageStyle={styles.cameraImage}
        resizeMode="cover">
        <View style={styles.cameraFallback} />
        <TouchableOpacity
          style={[
            styles.expandButton,
            {marginRight: expandRight, marginBottom: expandBottom},
          ]}
          activeOpacity={0.85}>
          <ExpandIcon />
        </TouchableOpacity>
      </ImageBackground>

      <View style={styles.bottomArea} onLayout={handleBottomAreaLayout}>
        <View
          style={[
            styles.joystickSection,
            isPanelOpen && styles.joystickSectionOpen,
            {
              paddingTop: isPanelOpen
                ? openJoystickPaddingTop
                : closedJoystickPaddingTop,
            },
          ]}>
          <View style={styles.joystickGestureLayer}>
            <JoystickPad
              compact={isPanelOpen}
              compactScale={compactJoystickScale}
              shellSize={joystickShellSize}
              disabled={!isConnected}
              onArrowPressIn={(axis, delta) => {
                startDirectionalMove(axis, delta).catch(() => undefined);
              }}
              onArrowPressOut={axis => {
                stopDirectionalMove(axis);
              }}
            />
          </View>
        </View>

        <View
          style={[
            styles.controlsRow,
            isPanelOpen
              ? {bottom: openControlsBottom}
              : {bottom: closedControlsBottom},
          ]}>
          <TouchableOpacity
            style={styles.smallControlButton}
            activeOpacity={0.85}
            onPress={() => setIsMicMuted(current => !current)}>
            {isMicMuted ? <MutedMicrophoneIcon /> : <MicrophoneIcon />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mainControlButton}
            activeOpacity={0.88}
            onPress={handleTogglePanel}>
            <FaceIcon color={isPanelOpen ? COLORS.green : '#0D0D0D'} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.smallControlButton} activeOpacity={0.85}>
            <SpeakerIcon />
          </TouchableOpacity>
        </View>

        {isPanelOpen ? (
          <View
            style={[
              styles.bottomSheet,
              {
                height: openSheetHeight,
                left: horizontalPadding,
                right: horizontalPadding,
              },
            ]}>
            <Text style={styles.otherTitle}>Other</Text>

            <ScrollView
              contentContainerStyle={[
                styles.otherGrid,
                {paddingBottom: insets.bottom + 16},
              ]}
              showsVerticalScrollIndicator={false}>
              {WATCHER_ACTION_ITEMS.map(item => (
                <TouchableOpacity
                  key={item.id}
                  testID={`surveillance-action-${item.id}`}
                  style={[
                    styles.otherItem,
                    selectedOtherId === item.id && styles.otherItemActive,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => {
                    handleOtherActionPress(item.id).catch(() => undefined);
                  }}>
                  <Image
                    source={item.imageSource}
                    style={[
                      styles.otherImage,
                      {width: otherImageSize, height: otherImageSize},
                    ]}
                    resizeMode="contain"
                  />
                  <Text style={styles.otherLabel} numberOfLines={2}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  cameraContainer: {
    width: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    backgroundColor: COLORS.cameraFallback,
  },
  cameraImage: {
    width: '100%',
    height: '100%',
  },
  cameraFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  expandButton: {
    alignSelf: 'flex-end',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  joystickSection: {
    alignItems: 'center',
  },
  joystickSectionOpen: {
    alignItems: 'center',
  },
  joystickGestureLayer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joystickShell: {
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  arrowWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerOuterCircle: {
    backgroundColor: COLORS.lightRing,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerRing: {
    borderColor: COLORS.green,
    backgroundColor: 'transparent',
  },
  controlsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
    zIndex: 3,
  },
  smallControlButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainControlButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    zIndex: 1,
  },
  otherTitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
    color: COLORS.black,
    marginLeft: 20,
    marginBottom: 16,
  },
  otherGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    rowGap: 16,
  },
  otherItem: {
    width: '33.3333%',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  otherItemActive: {
    backgroundColor: '#F3F5F8',
  },
  otherImage: {
    marginBottom: 8,
  },
  otherLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 14,
    color: COLORS.black,
    textAlign: 'center',
  },
});
