import React from 'react';
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
import {WatcherHeader} from '../../components/WatcherHeader';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import type {WatcherStackParamList} from '../../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<
  WatcherStackParamList,
  'BindingGuide'
>;

const COLORS = {
  background: '#F5F5F9',
  card: '#FFFFFF',
  title: '#000000',
  body: '#000000',
  green: '#8FC31F',
  preview: '#F3F5F8',
};

const steps = [
  ['1', 'Turn on your ', 'Watcher', ' device'],
  [
    '2',
    'After turning on the device, turn the\npage to "Setup" and click to enter. A\n',
    'QR code',
    ' will be displayed',
  ],
  ['3', 'Align the QR code and ', 'scan', ' it to bind\nthe device'],
] as const;

const ScanIcon: React.FC = () => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path
      d="M0.727274 5.81818C0.290903 5.81818 0 5.52727 0 5.0909V2.18182C0 1.01818 1.01818 0 2.18182 0H5.0909C5.52727 0 5.81818 0.290903 5.81818 0.727274C5.81818 1.16364 5.52727 1.45455 5.0909 1.45455H2.18182C1.74545 1.45455 1.45455 1.74545 1.45455 2.18182V5.0909C1.45455 5.52727 1.16364 5.81818 0.727274 5.81818ZM5.0909 16H2.18182C1.01818 16 0 14.9818 0 13.8182V10.9091C0 10.4727 0.290903 10.1818 0.727274 10.1818C1.16364 10.1818 1.45453 10.4727 1.45453 10.9091V13.8182C1.45453 14.2545 1.74544 14.5454 2.18181 14.5454H5.09089C5.52726 14.5454 5.81816 14.8364 5.81816 15.2727C5.81816 15.7091 5.52727 16 5.0909 16ZM13.8182 16H10.9091C10.4727 16 10.1818 15.7091 10.1818 15.2727C10.1818 14.8364 10.4727 14.5454 10.9091 14.5454H13.8182C14.2545 14.5454 14.5455 14.2545 14.5455 13.8182V10.9091C14.5455 10.4727 14.8364 10.1818 15.2727 10.1818C15.7091 10.1818 16 10.4727 16 10.9091V13.8182C16 14.9818 14.9818 16 13.8182 16ZM15.2727 5.81818C14.8364 5.81818 14.5455 5.52727 14.5455 5.0909V2.18182C14.5455 1.74545 14.2545 1.45455 13.8182 1.45455H10.9091C10.4727 1.45455 10.1818 1.16364 10.1818 0.727274C10.1818 0.290903 10.4727 1.5625e-08 10.9091 1.5625e-08H13.8182C14.9818 1.5625e-08 16 1.01818 16 2.18182V5.0909C16 5.52727 15.7091 5.81818 15.2727 5.81818ZM15.2727 8.72727H0.727274C0.290903 8.72727 0 8.43636 0 8C0 7.56363 0.290903 7.27273 0.727274 7.27273H15.2727C15.7091 7.27273 16 7.56363 16 8C16 8.43636 15.7091 8.72727 15.2727 8.72727Z"
      fill="#FFFFFF"
    />
  </Svg>
);

// 绑定引导页用于向用户说明开机、进入 Setup 和扫码绑定的完整步骤。
export const BindingGuidePage: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const {scaleValue, verticalScaleValue, windowWidth} = useResponsiveScale();

  // 页面主要尺寸按统一响应式规则换算
  const horizontalPadding = scaleValue(20, 18, 24);
  const contentWidth = windowWidth - horizontalPadding * 2;
  const cardWidth = Math.min(contentWidth, scaleValue(353, 326, 360));
  const sideInset = scaleValue(30, 24, 30);
  const titleTop = verticalScaleValue(12, 10, 14);
  const titleBlockHeight = verticalScaleValue(32, 30, 34);
  const cardTop = verticalScaleValue(32, 28, 36);
  const cardPaddingX = scaleValue(16, 14, 18);
  const cardPaddingY = verticalScaleValue(16, 14, 18);
  const previewTop = verticalScaleValue(16, 14, 18);
  const previewHeight = verticalScaleValue(280, 240, 280);
  const previewRobotWidth = Math.min(
    cardWidth * (191 / 353),
    scaleValue(191, 176, 196),
  );
  const previewRobotHeight = previewRobotWidth * (219 / 191);
  const stepsTop = verticalScaleValue(24, 20, 24);
  const buttonTop = verticalScaleValue(56, 42, 60);
  const buttonBottom = Math.max(
    insets.bottom + 12,
    verticalScaleValue(24, 20, 32),
  );
  const buttonWidth = Math.min(contentWidth, scaleValue(333, 308, 340));

  return (
    <View style={styles.safeArea}>
      <View style={[styles.statusBarSpacer, {height: insets.top}]} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {paddingBottom: buttonBottom},
        ]}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        bounces={false}>
        <View style={styles.container}>
          <WatcherHeader
            title=""
            onBack={() => navigation.goBack()}
            sideInset={sideInset}
            backgroundColor={COLORS.background}
          />

          <View
            style={[
              styles.titleBlock,
              {
                marginTop: titleTop,
                minHeight: titleBlockHeight,
              },
            ]}>
            <Text style={[styles.pageTitle, {marginLeft: sideInset}]}>
              Binding Device
            </Text>
          </View>

          <View
            style={[
              styles.card,
              {
                width: cardWidth,
                marginTop: cardTop,
                paddingHorizontal: cardPaddingX,
                paddingVertical: cardPaddingY,
              },
            ]}>
            <Text style={styles.cardTitle}>Get your Watcher device ready</Text>

            <View
              style={[
                styles.previewWrap,
                {
                  marginTop: previewTop,
                  height: previewHeight,
                },
              ]}>
              <Image
                source={require('../../assets/images/robot_watcher.png')}
                style={[
                  styles.robotImage,
                  {width: previewRobotWidth, height: previewRobotHeight},
                ]}
                resizeMode="contain"
              />
            </View>

            <View style={[styles.steps, {marginTop: stepsTop}]}>
              {steps.map(([index, before, accent, after]) => (
                <View key={index} style={styles.stepRow}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>{index}</Text>
                  </View>

                  <Text style={styles.stepText}>
                    <Text>{before}</Text>
                    <Text style={styles.stepAccent}>{accent}</Text>
                    <Text>{after}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              {
                width: buttonWidth,
                marginTop: buttonTop,
                marginBottom: buttonBottom,
              },
            ]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('ScanCode')}>
            <View style={styles.primaryButtonContent}>
              <ScanIcon />
              <Text style={styles.primaryButtonText}>Next</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  statusBarSpacer: {
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  titleBlock: {
    width: '100%',
    justifyContent: 'center',
  },
  pageTitle: {
    alignSelf: 'flex-start',
    fontFamily: 'Inter',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: COLORS.title,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
  },
  cardTitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '500',
    color: COLORS.title,
    textAlign: 'center',
  },
  previewWrap: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: COLORS.preview,
    alignItems: 'center',
    justifyContent: 'center',
  },
  robotImage: {
    width: 191,
    height: 219,
  },
  steps: {
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  stepBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  stepBadgeText: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    color: COLORS.body,
  },
  stepAccent: {
    color: COLORS.green,
  },
  primaryButton: {
    height: 54,
    borderRadius: 30,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});
