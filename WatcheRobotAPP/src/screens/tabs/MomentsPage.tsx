import React, {useMemo, useState} from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {CompositeNavigationProp} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {TabPageHeader} from '../../components/TabPageHeader';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import type {
  RootStackParamList,
  RootTabParamList,
} from '../../navigation/AppNavigator';

type NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'Moments'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type FeedTab = 'discover' | 'following';

type FeedItem = {
  id: string;
  author: string;
  avatarUri: string;
  content: string;
  imageUri: string;
  timestamp: string;
  comments: number;
  likes: number;
};

const COLORS = {
  background: '#F5F5F9',
  white: '#FFFFFF',
  black: '#0D0D0D',
  muted: '#636A74',
  tabBg: '#E1E1E7',
  tabText: '#636A74',
  activeGreen: '#8FC31F',
  divider: '#EEF0F3',
};

const AVATAR_URI =
  'https://www.figma.com/api/mcp/asset/e0acde29-8800-4d64-9083-af4c346cae11';
const POST_IMAGE_URI =
  'https://www.figma.com/api/mcp/asset/6f039da4-9885-4ce8-a29c-3914d85fe64a';

const POSTS: FeedItem[] = [
  {
    id: 'moment-1',
    author: 'Red crayfish',
    avatarUri: AVATAR_URI,
    content:
      'After turning on the device, turn the page to "Setup" and click to enter. A QR code will be displayed',
    imageUri: POST_IMAGE_URI,
    timestamp: '01-12 12:23:34',
    comments: 123,
    likes: 123,
  },
  {
    id: 'moment-2',
    author: 'Red crayfish',
    avatarUri: AVATAR_URI,
    content:
      'After turning on the device, turn the page to "Setup" and click to enter. A QR code will be displayed',
    imageUri: POST_IMAGE_URI,
    timestamp: '01-12 12:23:34',
    comments: 123,
    likes: 123,
  },
];

const CommentIcon: React.FC = () => (
  <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
    <Path
      d="M2.5 2.25H9.5C9.91421 2.25 10.25 2.58579 10.25 3V7C10.25 7.41421 9.91421 7.75 9.5 7.75H5.58046L3.43023 9.54394C3.10465 9.81526 2.625 9.58376 2.625 9.16009V7.75H2.5C2.08579 7.75 1.75 7.41421 1.75 7V3C1.75 2.58579 2.08579 2.25 2.5 2.25Z"
      stroke={COLORS.black}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const HeartIcon: React.FC = () => (
  <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
    <Path
      d="M6 9.88462L5.45577 9.39038C3.52308 7.63846 2.25 6.48462 2.25 5.07692C2.25 3.92308 3.15385 3 4.30769 3C4.95962 3 5.58538 3.30385 6 3.78269C6.41462 3.30385 7.04038 3 7.69231 3C8.84615 3 9.75 3.92308 9.75 5.07692C9.75 6.48462 8.47692 7.63846 6.54423 9.39423L6 9.88462Z"
      stroke={COLORS.black}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const FeedCard: React.FC<{item: FeedItem; cardWidth: number}> = ({
  item,
  cardWidth,
}) => {
  const imageHeight = Math.round(cardWidth * (179 / 321));

  return (
    <View style={[styles.card, {width: cardWidth}]}>
      <View style={styles.cardHeader}>
        <Image source={{uri: item.avatarUri}} style={styles.avatar} />
        <Text style={styles.author}>{item.author}</Text>
      </View>

      <Text style={styles.content}>{item.content}</Text>

      <Image
        source={{uri: item.imageUri}}
        style={[styles.cardImage, {height: imageHeight}]}
        resizeMode="cover"
      />

      <View style={styles.cardFooter}>
        <Text style={styles.timestamp}>{item.timestamp}</Text>

        <View style={styles.metrics}>
          <View style={styles.metricItem}>
            <CommentIcon />
            <Text style={styles.metricText}>{item.comments}</Text>
          </View>

          <View style={styles.metricItem}>
            <HeartIcon />
            <Text style={styles.metricText}>{item.likes}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

export const MomentsPage: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const {windowWidth, scaleValue, verticalScaleValue} = useResponsiveScale();
  const [activeTab, setActiveTab] = useState<FeedTab>('discover');

  const headerHorizontalPadding = scaleValue(20, 18, 24);
  const horizontalPadding = scaleValue(20, 18, 24);
  const contentWidth = windowWidth - horizontalPadding * 2;
  const sectionTopPadding = verticalScaleValue(10, 8, 14);
  const headerBottom = verticalScaleValue(24, 18, 26);
  const headerTitleInset = scaleValue(8, 6, 10);
  const cardWidth = Math.min(contentWidth, scaleValue(353, 333, 353));
  const tabHeight = verticalScaleValue(50, 48, 50);
  const tabInnerHeight = verticalScaleValue(42, 40, 42);
  const tabBottom = verticalScaleValue(24, 20, 28);
  const feedGap = verticalScaleValue(24, 20, 24);
  const bottomSpacing = insets.bottom + verticalScaleValue(96, 84, 112);

  const feedItems = useMemo(
    () => (activeTab === 'discover' ? POSTS : POSTS.slice(0, 1)),
    [activeTab],
  );

  return (
    <View style={styles.container}>
      <TabPageHeader
        topInset={insets.top + sectionTopPadding}
        horizontalPadding={headerHorizontalPadding}
        title="Moments"
        titleInset={headerTitleInset}
        onPressBell={() => navigation.navigate('Notification')}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {paddingBottom: bottomSpacing},
        ]}
        showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.segmentedWrap,
            {width: cardWidth, marginTop: headerBottom, marginBottom: tabBottom},
          ]}>
          <View style={[styles.segmented, {height: tabHeight}]}>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                styles.segmentButtonActive,
                {
                  height: tabInnerHeight,
                  width: Math.floor((cardWidth - 8) / 2),
                },
              ]}
              activeOpacity={0.85}
              onPress={() => setActiveTab('discover')}>
              <Text style={styles.segmentTextActive}>Discover</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentButton,
                {
                  height: tabInnerHeight,
                  width: Math.ceil((cardWidth - 8) / 2),
                },
              ]}
              activeOpacity={0.85}
              onPress={() => setActiveTab('following')}>
              <Text style={styles.segmentText}>Following</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.feedList, {gap: feedGap}]}>
          {feedItems.map(item => (
            <FeedCard key={item.id} item={item} cardWidth={cardWidth} />
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  segmentedWrap: {
    paddingHorizontal: 0,
  },
  segmented: {
    backgroundColor: COLORS.tabBg,
    borderRadius: 30,
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segmentButton: {
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: COLORS.white,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 8.4,
    shadowOffset: {width: 0, height: 1},
    elevation: 2,
  },
  segmentTextActive: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 14,
    fontWeight: '600',
    color: COLORS.black,
  },
  segmentText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 14,
    fontWeight: '400',
    color: COLORS.tabText,
  },
  feedList: {
    width: '100%',
    alignItems: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E1E1E7',
  },
  author: {
    fontFamily: 'SF Pro',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  content: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    color: COLORS.muted,
    marginBottom: 24,
  },
  cardImage: {
    width: '100%',
    borderRadius: 16,
    marginBottom: 24,
    backgroundColor: '#E1E1E7',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timestamp: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '400',
    color: COLORS.black,
  },
  metrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '400',
    color: COLORS.black,
  },
});
