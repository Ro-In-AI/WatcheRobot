import React, {useEffect, useMemo, useState} from 'react';
import {
  Image,
  Modal,
  type StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {
  CompositeNavigationProp,
  RouteProp,
} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, Path} from 'react-native-svg';
import {TabPageHeader} from '../../components/TabPageHeader';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import type {
  RootStackParamList,
  RootTabParamList,
} from '../../navigation/AppNavigator';

type NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'Nearby'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type RouteProps = RouteProp<RootTabParamList, 'Nearby'>;

type NearbyModalType =
  | 'discovery'
  | 'travelConfirmation'
  | 'invitationSent'
  | 'incomingInvite'
  | 'incomingVisit'
  | null;

const COLORS = {
  background: '#F5F5F9',
  black: '#000000',
  white: '#FFFFFF',
  green: '#8FC31F',
  greenDark: '#7EB11A',
  bubble: '#D9D9D9',
  overlay: 'rgba(0, 0, 0, 0.65)',
  bodyText: '#636A74',
  subText: '#8E959F',
  buttonGray: '#F5F5F9',
};

const DEFAULT_DISCOVERY_NAME = 'Garlic-flavored\ncrayfish';
const DEFAULT_DISTANCE = 'Just 100m away';
const DEFAULT_REQUESTER = 'Crab A';
const DEFAULT_TARGET = 'Spicy Crab';

// Nearby 是“附近设备互访”的入口页，主要负责发起邀请、访问以及接收附近请求。
const CloseIcon: React.FC = () => (
  <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
    <Circle cx="9" cy="9" r="9" fill="#D9DDE2" />
    <Path
      d="M6 6L12 12M12 6L6 12"
      stroke="#FFFFFF"
      strokeWidth={1.8}
      strokeLinecap="round"
    />
  </Svg>
);

const LocationIcon: React.FC = () => (
  <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
    <Path
      d="M6 1.25C4.48122 1.25 3.25 2.48122 3.25 4C3.25 6.12671 6 10.25 6 10.25C6 10.25 8.75 6.12671 8.75 4C8.75 2.48122 7.51878 1.25 6 1.25ZM6 5.125C5.37868 5.125 4.875 4.62132 4.875 4C4.875 3.37868 5.37868 2.875 6 2.875C6.62132 2.875 7.125 3.37868 7.125 4C7.125 4.62132 6.62132 5.125 6 5.125Z"
      fill={COLORS.subText}
    />
  </Svg>
);

const DiscoveryIllustration: React.FC = () => (
  <View style={styles.discoveryIllustration}>
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 180 92" fill="none">
      <Path
        d="M58 67C72 37 107 29 124 49"
        stroke={COLORS.green}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
    <Image
      source={require('../../assets/images/robot_watcher.png')}
      style={[styles.discoveryRobot, styles.discoveryRobotLeft]}
      resizeMode="contain"
    />
    <Image
      source={require('../../assets/images/robot_watcher.png')}
      style={[styles.discoveryRobot, styles.discoveryRobotRight]}
      resizeMode="contain"
    />
  </View>
);

const RequestRobotCard: React.FC = () => (
  <View style={styles.requestRobotWrap}>
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 137 137" fill="none">
      <Circle cx="68.5" cy="68.5" r="68" stroke="#8FC31F" />
    </Svg>
    <Image
      source={require('../../assets/images/robot_watcher.png')}
      style={styles.requestRobotImage}
      resizeMode="contain"
    />
  </View>
);

const ModalActionButton: React.FC<{
  label: string;
  variant: 'primary' | 'secondary';
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}> = ({label, variant, onPress, style, textStyle}) => (
  <TouchableOpacity
    style={[
      styles.modalActionButton,
      variant === 'primary'
        ? styles.modalActionPrimary
        : styles.modalActionSecondary,
      style,
    ]}
    activeOpacity={0.85}
    onPress={onPress}>
    <Text
      style={[
        styles.modalActionText,
        variant === 'primary'
          ? styles.modalActionPrimaryText
          : styles.modalActionSecondaryText,
        textStyle,
      ]}>
      {label}
    </Text>
  </TouchableOpacity>
);

// Nearby 页负责展示附近设备发现、发起邀请/访问，以及处理来访请求。
// 这个页面的主体是互访流程编排，页面本身更像一个承接多个弹窗状态的流程入口。
export const NearbyPage: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const {windowWidth, windowHeight, scaleValue, verticalScaleValue} =
    useResponsiveScale();

  const [activeModal, setActiveModal] = useState<NearbyModalType>(null);
  const [requesterName, setRequesterName] = useState(DEFAULT_REQUESTER);
  const [targetName, setTargetName] = useState(DEFAULT_TARGET);

  const headerHorizontalPadding = scaleValue(20, 18, 24);
  const horizontalPadding = scaleValue(30, 24, 30);
  const contentWidth = windowWidth - horizontalPadding * 2;
  const sectionTopPadding = verticalScaleValue(10, 8, 14);
  const headerTop = insets.top + sectionTopPadding;
  const headerTitleInset = scaleValue(8, 6, 10);

  const heroWidth = Math.min(contentWidth, scaleValue(333, 308, 352));
  const heroTop = verticalScaleValue(158, 142, 158);
  const heroHeight = verticalScaleValue(332, 306, 338);
  const mainBubbleSize = Math.min(
    heroWidth * (298 / 333),
    scaleValue(298, 268, 298),
  );
  const mainBubbleTop = verticalScaleValue(71, 64, 71);
  const topBubbleSize = scaleValue(116, 104, 116);
  const topBubbleTop = 0;
  const topBubbleLeft = heroWidth * (190 / 333);
  const leftTopBubbleSize = scaleValue(53, 48, 53);
  const leftTopBubbleTop = verticalScaleValue(106, 98, 106);
  const leftTopBubbleLeft = heroWidth * (17 / 333);
  const rightBubbleSize = scaleValue(59, 54, 59);
  const rightBubbleTop = verticalScaleValue(266, 252, 266);
  const rightBubbleLeft = heroWidth * (277 / 333);
  const leftBottomBubbleSize = scaleValue(86, 78, 86);
  const leftBottomBubbleTop = verticalScaleValue(286, 272, 286);
  const leftBottomBubbleLeft = heroWidth * (4 / 333);

  const robotWidth = Math.min(
    heroWidth * (138 / 333),
    scaleValue(138, 128, 138),
  );
  const robotHeight = verticalScaleValue(158, 146, 158);
  const robotTop = verticalScaleValue(141, 130, 141);
  const meTop = verticalScaleValue(318, 302, 318);

  const buttonWidth = Math.min(contentWidth, scaleValue(333, 308, 333));
  const buttonHeight = verticalScaleValue(52, 50, 52);
  const tabBarBottom = insets.bottom + verticalScaleValue(8, 8, 8);
  const tabBarHeight = verticalScaleValue(54, 54, 54);
  const buttonToTabGap = verticalScaleValue(111, 100, 118);
  const buttonTop =
    windowHeight - tabBarBottom - tabBarHeight - buttonToTabGap - buttonHeight;

  const modalWidth = Math.min(
    contentWidth - scaleValue(9, 0, 12),
    scaleValue(324, 300, 332),
  );
  const modalHorizontalInset = scaleValue(34, 24, 40);

  // 当其它页面通过 tab 参数把场景带进来时，这里负责恢复对应弹窗。
  useEffect(() => {
    const scenario = route.params?.scenario;
    if (!scenario) {
      return;
    }

    setRequesterName(route.params?.requesterName ?? DEFAULT_REQUESTER);
    setTargetName(route.params?.targetName ?? DEFAULT_TARGET);
    setActiveModal(
      scenario === 'incomingInvite' ? 'incomingInvite' : 'incomingVisit',
    );
    navigation.setParams({
      scenario: undefined,
      requesterName: undefined,
      targetName: undefined,
    });
  }, [
    navigation,
    route.params?.requesterName,
    route.params?.scenario,
    route.params?.targetName,
  ]);

  // 根据当前请求类型切换提示文案，避免邀请和访问显示成同一段文字。
  const activeRequestCopy = useMemo(() => {
    if (activeModal === 'incomingInvite') {
      return `[${requesterName}] Is it okay to invite your Watcher to visit?`;
    }

    return `[${requesterName}] Wondering if it's okay for your Watcher to visit.`;
  }, [activeModal, requesterName]);

  // Nearby 主动发起“访问”时，下一步切到 Watcher 页输入访问时长。
  const openWatcherDurationFlow = () => {
    setActiveModal(null);
    navigation.navigate('Watcher', {
      scenario: 'visitDuration',
      requesterName,
      targetName,
    });
  };

  // Nearby 主动发起“邀请”时，下一步切到 Watcher 页等待对方确认。
  const openWatcherIncomingRequest = () => {
    setActiveModal(null);
    navigation.navigate('Watcher', {
      scenario: 'incomingRequest',
      requestKind: 'invite',
      requesterName,
      targetName,
    });
  };

  // Nearby 作为被访问方时，允许后直接进入访问中的会话页。
  const handlePermitNearbyRequest = () => {
    setActiveModal(null);
    navigation.navigate('VisitingSession', {
      statusText: `[${requesterName}] is visiting...`,
      buttonLabel: 'End the visit.',
    });
  };

  return (
    <View style={styles.container}>
      <TabPageHeader
        topInset={headerTop}
        horizontalPadding={headerHorizontalPadding}
        title="Nearby"
        titleInset={headerTitleInset}
        onPressBell={() => navigation.navigate('Notification')}
        onLongPressBell={() => setActiveModal('incomingInvite')}
      />

      <View
        style={[
          styles.heroLayer,
          {
            top: heroTop,
            width: heroWidth,
            height: heroHeight,
            left: (windowWidth - heroWidth) / 2,
          },
        ]}>
        <View
          style={[
            styles.bubble,
            styles.mainBubble,
            {
              top: mainBubbleTop,
              width: mainBubbleSize,
              height: mainBubbleSize,
              borderRadius: mainBubbleSize / 2,
              left: (heroWidth - mainBubbleSize) / 2,
            },
          ]}
        />
        <View
          style={[
            styles.bubble,
            {
              top: topBubbleTop,
              left: topBubbleLeft,
              width: topBubbleSize,
              height: topBubbleSize,
              borderRadius: topBubbleSize / 2,
            },
          ]}
        />
        <View
          style={[
            styles.bubble,
            {
              top: leftTopBubbleTop,
              left: leftTopBubbleLeft,
              width: leftTopBubbleSize,
              height: leftTopBubbleSize,
              borderRadius: leftTopBubbleSize / 2,
            },
          ]}
        />
        <View
          style={[
            styles.bubble,
            {
              top: rightBubbleTop,
              left: rightBubbleLeft,
              width: rightBubbleSize,
              height: rightBubbleSize,
              borderRadius: rightBubbleSize / 2,
            },
          ]}
        />
        <View
          style={[
            styles.bubble,
            {
              top: leftBottomBubbleTop,
              left: leftBottomBubbleLeft,
              width: leftBottomBubbleSize,
              height: leftBottomBubbleSize,
              borderRadius: leftBottomBubbleSize / 2,
            },
          ]}
        />

        <Image
          source={require('../../assets/images/robot_watcher.png')}
          style={[
            styles.robotImage,
            {
              top: robotTop,
              width: robotWidth,
              height: robotHeight,
              left: (heroWidth - robotWidth) / 2,
            },
          ]}
          resizeMode="contain"
        />

        <Text style={[styles.meText, {top: meTop}]}>Me</Text>
      </View>

      {/* 主操作按钮：正常点击走“发现附近设备”，长按用于本地调试来访弹窗。 */}
      <TouchableOpacity
        style={[
          styles.matchButton,
          {
            top: buttonTop,
            width: buttonWidth,
            height: buttonHeight,
            left: (windowWidth - buttonWidth) / 2,
          },
        ]}
        activeOpacity={0.88}
        onPress={() => setActiveModal('discovery')}
        onLongPress={() => setActiveModal('incomingVisit')}>
        <Text style={styles.matchButtonText}>Match nearby devices</Text>
      </TouchableOpacity>

      <Modal
        visible={activeModal !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setActiveModal(null)}>
        <View
          style={[
            styles.modalOverlay,
            {paddingHorizontal: modalHorizontalInset},
          ]}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setActiveModal(null)}
          />

          {/* 发现附近设备后的首个弹窗，用户可以选择邀请或直接访问。 */}
          {activeModal === 'discovery' ? (
            <View
              style={[
                styles.modalCard,
                styles.discoveryCard,
                {width: modalWidth},
              ]}>
              <TouchableOpacity
                style={styles.discoveryClose}
                activeOpacity={0.8}
                onPress={() => setActiveModal(null)}>
                <CloseIcon />
              </TouchableOpacity>

              <Text style={styles.discoveryTitle}>Nearby Discovery</Text>
              <DiscoveryIllustration />
              <Text style={styles.discoveryName}>{DEFAULT_DISCOVERY_NAME}</Text>
              <View style={styles.discoveryDistanceRow}>
                <LocationIcon />
                <Text style={styles.discoveryDistance}>{DEFAULT_DISTANCE}</Text>
              </View>

              <View style={styles.discoveryActions}>
                <ModalActionButton
                  label="Invitation"
                  variant="secondary"
                  style={styles.discoveryActionButton}
                  textStyle={styles.discoveryActionText}
                  onPress={() => setActiveModal('invitationSent')}
                />
                <ModalActionButton
                  label="Visitation"
                  variant="primary"
                  style={styles.discoveryActionButton}
                  textStyle={styles.discoveryActionText}
                  onPress={() => setActiveModal('travelConfirmation')}
                />
              </View>
            </View>
          ) : null}

          {/* 访问链路：确认后跳到 Watcher 页继续输入访问时长。 */}
          {activeModal === 'travelConfirmation' ? (
            <View
              style={[
                styles.modalCard,
                styles.confirmationCard,
                {width: modalWidth},
              ]}>
              <Text style={styles.modalTitle}>Travel Confirmation</Text>
              <Text style={styles.modalDescription}>
                Your crayfish went to visit [{DEFAULT_REQUESTER}]
              </Text>

              <View style={styles.modalActionsRow}>
                <ModalActionButton
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setActiveModal(null)}
                />
                <ModalActionButton
                  label="Confirm"
                  variant="primary"
                  onPress={openWatcherDurationFlow}
                />
              </View>
            </View>
          ) : null}

          {/* 邀请链路：确认后跳到 Watcher 页展示收到邀请的提示。 */}
          {activeModal === 'invitationSent' ? (
            <View
              style={[
                styles.modalCard,
                styles.confirmationCard,
                {width: modalWidth},
              ]}>
              <Text style={styles.modalTitle}>Invitation Sent</Text>
              <Text style={styles.modalDescription}>
                Invitation has been sent and is awaiting the recipient's approval.
              </Text>

              <View style={styles.modalActionsRow}>
                <ModalActionButton
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setActiveModal(null)}
                />
                <ModalActionButton
                  label="Confirm"
                  variant="primary"
                  onPress={openWatcherIncomingRequest}
                />
              </View>
            </View>
          ) : null}

          {/* 被动收到邀请/访问请求时，在 Nearby 页直接做允许或拒绝。 */}
          {activeModal === 'incomingInvite' || activeModal === 'incomingVisit' ? (
            <View
              style={[styles.modalCard, styles.requestCard, {width: modalWidth}]}>
              <Text style={styles.modalTitle}>Visiting Request</Text>
              <RequestRobotCard />
              <Text style={styles.requestDescription}>{activeRequestCopy}</Text>

              <View style={styles.modalActionsRow}>
                <ModalActionButton
                  label="Refuse"
                  variant="secondary"
                  onPress={() => setActiveModal(null)}
                />
                <ModalActionButton
                  label="Permit"
                  variant="primary"
                  onPress={handlePermitNearbyRequest}
                />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    width: '100%',
    minHeight: 34,
    justifyContent: 'center',
    position: 'relative',
  },
  heroLayer: {
    position: 'absolute',
  },
  bubble: {
    position: 'absolute',
    backgroundColor: COLORS.bubble,
  },
  mainBubble: {
    opacity: 0.75,
  },
  robotImage: {
    position: 'absolute',
  },
  meText: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 14,
    fontWeight: '400',
    color: COLORS.black,
  },
  matchButton: {
    position: 'absolute',
    borderRadius: 30,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '500',
    color: COLORS.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 34,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    position: 'relative',
    borderRadius: 14,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  discoveryCard: {
    paddingTop: 22,
    paddingBottom: 22,
    paddingHorizontal: 20,
  },
  discoveryClose: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  discoveryTitle: {
    marginTop: 20,
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: COLORS.black,
  },
  discoveryIllustration: {
    marginTop: 14,
    width: 186,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  discoveryRobot: {
    position: 'absolute',
    width: 68,
    height: 68,
  },
  discoveryRobotLeft: {
    left: 34,
    bottom: 0,
  },
  discoveryRobotRight: {
    right: 28,
    top: 0,
    width: 58,
    height: 58,
  },
  discoveryName: {
    marginTop: 12,
    fontFamily: 'Inter',
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
  },
  discoveryDistanceRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  discoveryDistance: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '400',
    color: COLORS.subText,
  },
  discoveryActions: {
    marginTop: 24,
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  discoveryActionButton: {
    height: 42,
    borderRadius: 21,
  },
  discoveryActionText: {
    fontSize: 12,
    lineHeight: 14,
  },
  confirmationCard: {
    paddingTop: 22,
  },
  requestCard: {
    paddingTop: 18,
  },
  modalTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '500',
    color: COLORS.black,
    textAlign: 'center',
  },
  modalDescription: {
    marginTop: 22,
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '400',
    color: COLORS.bodyText,
    textAlign: 'center',
  },
  requestRobotWrap: {
    marginTop: 14,
    width: 137,
    height: 137,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestRobotImage: {
    width: 84,
    height: 84,
  },
  requestDescription: {
    marginTop: 8,
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '400',
    color: COLORS.bodyText,
    textAlign: 'center',
  },
  modalActionsRow: {
    marginTop: 24,
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  modalActionButton: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionPrimary: {
    backgroundColor: COLORS.green,
  },
  modalActionSecondary: {
    backgroundColor: COLORS.buttonGray,
  },
  modalActionText: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '500',
  },
  modalActionPrimaryText: {
    color: COLORS.white,
  },
  modalActionSecondaryText: {
    color: COLORS.greenDark,
  },
});
