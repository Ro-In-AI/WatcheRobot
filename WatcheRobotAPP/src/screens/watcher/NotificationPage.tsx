import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, Defs, G, Path, ClipPath, Rect} from 'react-native-svg';
import {WatcherHeader} from '../../components/WatcherHeader';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import type {RootStackParamList} from '../../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Notification'
>;

const COLORS = {
  background: '#F5F5F9',
  white: '#FFFFFF',
  black: '#000000',
  green: '#8FC31F',
  blue: '#3396D3',
  subText: '#8E959F',
  bodyText: '#636A74',
  divider: '#EFF0F1',
  badge: '#D90012',
};

const QuickHeartIcon: React.FC = () => (
  <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
    <Path
      d="M16.0012 26.6665L14.0666 24.9065C7.19991 18.6932 2.66658 14.5865 2.66658 9.5465C2.66658 5.43984 5.89325 2.21317 9.99991 2.21317C12.3199 2.21317 14.5466 3.29317 16.0012 4.9865C17.4559 3.29317 19.6826 2.21317 22.0026 2.21317C26.1092 2.21317 29.3359 5.43984 29.3359 9.5465C29.3359 14.5865 24.8026 18.6932 17.9359 24.9198L16.0012 26.6665Z"
      fill="#D90012"
    />
    <Circle cx="23.8" cy="7.2" r="2.2" fill={COLORS.white} />
  </Svg>
);

const QuickFollowerIcon: React.FC = () => (
  <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
    <Circle cx="16" cy="9" r="5" fill={COLORS.green} />
    <Path
      d="M8 24.3333C8 20.4673 11.134 17.3333 15 17.3333H17C20.866 17.3333 24 20.4673 24 24.3333V25.6667H8V24.3333Z"
      fill={COLORS.green}
    />
  </Svg>
);

const QuickCommentIcon: React.FC = () => (
  <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
    <Path
      d="M6 8.66667C6 6.45753 7.79086 4.66667 10 4.66667H22C24.2091 4.66667 26 6.45753 26 8.66667V16.6667C26 18.8758 24.2091 20.6667 22 20.6667H13.6L8.66667 24.4V20.6667H10C7.79086 20.6667 6 18.8758 6 16.6667V8.66667Z"
      fill={COLORS.blue}
    />
    <Path d="M11 11H21" stroke={COLORS.white} strokeWidth={2} strokeLinecap="round" />
    <Path d="M11 15H18" stroke={COLORS.white} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const SearchIcon: React.FC = () => (
  <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
    <G clipPath="url(#notification-search-clip)">
      <Path
        d="M17.1768 15.9795L14.2518 13.0534C15.3442 11.6934 15.9388 10.0008 15.937 8.25636C15.9373 6.73568 15.4865 5.24908 14.6418 3.98458C13.7971 2.72008 12.5964 1.73448 11.1915 1.15244C9.7866 0.570393 8.24065 0.418045 6.74917 0.714662C5.25769 1.01128 3.88768 1.74354 2.81239 2.81883C1.7371 3.89411 1.00484 5.26413 0.708223 6.75561C0.411606 8.24709 0.563954 9.79303 1.146 11.1979C1.72804 12.6028 2.71364 13.8035 3.97814 14.6483C5.24264 15.493 6.72924 15.9437 8.24993 15.9435C10.0004 15.9456 11.6985 15.3467 13.0604 14.247L15.9843 17.1709C16.0625 17.2516 16.1559 17.3161 16.2591 17.3606C16.3623 17.4051 16.4733 17.4288 16.5857 17.4302C16.6981 17.4317 16.8097 17.4109 16.914 17.3691C17.0184 17.3273 17.1134 17.2653 17.1937 17.1866C17.3512 17.0241 17.4378 16.8058 17.4347 16.5796C17.4315 16.3533 17.3388 16.1375 17.1768 15.9795ZM2.2503 8.25749C2.2503 7.46961 2.40549 6.68944 2.70699 5.96153C3.0085 5.23362 3.45043 4.57223 4.00755 4.01511C4.56467 3.458 5.22606 3.01607 5.95397 2.71456C6.68188 2.41305 7.46204 2.25786 8.24993 2.25786C9.03781 2.25786 9.81798 2.41305 10.5459 2.71456C11.2738 3.01607 11.9352 3.458 12.4923 4.01511C13.0494 4.57223 13.4913 5.23362 13.7929 5.96153C14.0944 6.68944 14.2496 7.46961 14.2495 8.25749C14.2495 9.84884 13.6174 11.375 12.4921 12.5003C11.3669 13.6255 9.84071 14.2577 8.24936 14.2577C6.65801 14.2577 5.13184 13.6255 4.00659 12.5003C2.88134 11.375 2.24918 9.84884 2.24918 8.25749H2.2503Z"
        fill="black"
      />
    </G>
    <Defs>
      <ClipPath id="notification-search-clip">
        <Rect width="18" height="18" fill="white" />
      </ClipPath>
    </Defs>
  </Svg>
);

const WatcherAvatar: React.FC = () => (
  <View style={styles.watcherAvatar}>
    <Svg width={24} height={24} viewBox="0 0 32 32" fill="none">
      <Circle cx="16" cy="16" r="16" fill="#000000" />
      <Path
        d="M9 16.8C9 12.4917 12.4917 9 16.8 9H22.2V16.8C22.2 21.1083 18.7083 24.6 14.4 24.6H9V16.8Z"
        fill="#9ED11F"
      />
      <Circle cx="13.2" cy="16.8" r="1.6" fill="#000000" />
      <Circle cx="18.8" cy="16.8" r="1.6" fill="#000000" />
    </Svg>
  </View>
);

const CrabaAvatar: React.FC = () => (
  <View style={styles.crabaAvatar}>
    <Text style={styles.crabaAvatarText}>CA</Text>
  </View>
);

type NoticeItem = {
  id: string;
  title: string;
  message: string;
  time: string;
  badge?: number;
  type: 'notice' | 'watcher' | 'craba';
};

const noticeItems: NoticeItem[] = [
  {
    id: 'notice',
    title: 'Notice',
    message: 'Your Agent "Crab A" has formed a...',
    time: 'Just Now',
    badge: 12,
    type: 'notice',
  },
  {
    id: 'watcher',
    title: 'Watcher',
    message: 'Your Agent "Crab A" has formed a...',
    time: '5min',
    badge: 1,
    type: 'watcher',
  },
  ...Array.from({length: 5}).map((_, index) => ({
    id: `craba-${index}`,
    title: 'Craba A',
    message: 'Your Agent "Crab A" has formed a...',
    time: '5min',
    badge: 1,
    type: 'craba' as const,
  })),
];

const NotificationAvatar: React.FC<{type: NoticeItem['type']}> = ({type}) => {
  if (type === 'notice') {
    return (
      <View style={styles.noticeAvatar}>
        <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
          <Path
            d="M11 20.1667C6.39763 20.1667 2.66667 16.4357 2.66667 11.8333V10.4583C2.66667 9.51667 3.14167 8.64167 3.93333 8.11667L4.83333 7.51667V6.83333C4.83333 3.51667 7.51667 0.833333 10.8333 0.833333H11.1667C14.4833 0.833333 17.1667 3.51667 17.1667 6.83333V7.51667L18.0667 8.11667C18.8583 8.64167 19.3333 9.51667 19.3333 10.4583V11.8333C19.3333 16.4357 15.6024 20.1667 11 20.1667Z"
            fill={COLORS.white}
          />
        </Svg>
      </View>
    );
  }

  return type === 'watcher' ? <WatcherAvatar /> : <CrabaAvatar />;
};

// 通知页目前以静态消息为主，用来承接右上角铃铛入口的视觉展示。
export const NotificationPage: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const {scaleValue, verticalScaleValue, windowWidth} = useResponsiveScale();

  const sideInset = scaleValue(30, 24, 30);
  const horizontalPadding = scaleValue(20, 18, 24);
  const contentWidth = windowWidth - horizontalPadding * 2;
  const quickCardSize = scaleValue(56, 52, 56);
  const listWidth = Math.min(contentWidth, scaleValue(353, 326, 360));
  const itemVerticalPadding = verticalScaleValue(11, 10, 12);

  return (
    <View style={styles.safeArea}>
      <View style={[styles.statusBarSpacer, {height: insets.top}]} />
      <View style={styles.container}>
        <WatcherHeader
          title="Message"
          onBack={() => navigation.goBack()}
          sideInset={sideInset}
          backgroundColor={COLORS.white}
          rightSlot={
            <TouchableOpacity activeOpacity={0.8} style={styles.searchButton}>
              <SearchIcon />
            </TouchableOpacity>
          }
        />

        {/* 顶部快捷入口用于展示常见消息分类，目前还没有接入真实跳转。 */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: horizontalPadding,
              paddingTop: verticalScaleValue(18, 14, 20),
              paddingBottom: insets.bottom + verticalScaleValue(32, 24, 40),
            },
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.quickSection}>
            <View style={styles.quickItem}>
              <View style={[styles.quickCircle, {width: quickCardSize, height: quickCardSize, borderRadius: quickCardSize / 2}]}>
                <QuickHeartIcon />
              </View>
              <Text style={styles.quickLabel}>Likes</Text>
            </View>

            <View style={styles.quickItem}>
              <View style={[styles.quickCircle, {width: quickCardSize, height: quickCardSize, borderRadius: quickCardSize / 2}]}>
                <QuickFollowerIcon />
              </View>
              <Text style={styles.quickLabel}>New Follower</Text>
            </View>

            <View style={styles.quickItem}>
              <View style={[styles.quickCircle, {width: quickCardSize, height: quickCardSize, borderRadius: quickCardSize / 2}]}>
                <QuickCommentIcon />
              </View>
              <Text style={styles.quickLabel}>Comments</Text>
            </View>
          </View>

          {/* 下方列表用于集中展示 Notice / Watcher / Crab A 等消息卡片。 */}
          <View style={[styles.listCard, {width: listWidth}]}>
            {noticeItems.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.noticeRow,
                  {paddingVertical: itemVerticalPadding},
                  index !== noticeItems.length - 1 && styles.noticeRowDivider,
                ]}>
                <NotificationAvatar type={item.type} />

                <View style={styles.noticeContent}>
                  <View style={styles.noticeHeaderRow}>
                    <Text style={styles.noticeTitle}>{item.title}</Text>
                    <Text style={styles.noticeTime}>{item.time}</Text>
                  </View>

                  <View style={styles.noticeBodyRow}>
                    <Text style={styles.noticeMessage} numberOfLines={1}>
                      {item.message}
                    </Text>
                    {item.badge ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  statusBarSpacer: {
    backgroundColor: COLORS.white,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
  },
  searchButton: {
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickSection: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  quickItem: {
    alignItems: 'center',
    width: '30%',
  },
  quickCircle: {
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickLabel: {
    marginTop: 10,
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
  },
  listCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noticeRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  noticeAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.green,
    justifyContent: 'center',
    alignItems: 'center',
  },
  watcherAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  crabaAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#D7C3A6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  crabaAvatarText: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  noticeContent: {
    flex: 1,
    marginLeft: 14,
  },
  noticeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  noticeBodyRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  noticeTitle: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '500',
    color: COLORS.black,
  },
  noticeTime: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '400',
    color: COLORS.subText,
  },
  noticeMessage: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '400',
    color: COLORS.bodyText,
    marginRight: 8,
  },
  badge: {
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 4,
    backgroundColor: COLORS.badge,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontFamily: 'Inter',
    fontSize: 10,
    lineHeight: 10,
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
  },
});
