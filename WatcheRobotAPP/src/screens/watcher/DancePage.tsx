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
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path, Rect} from 'react-native-svg';
import {WatcherHeader} from '../../components/WatcherHeader';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import type {RootStackParamList} from '../../navigation/AppNavigator';
import {
  BluetoothStatus,
  useBluetooth,
} from '../../modules/bluetooth';
import {
  WATCHER_ACTION_ITEMS,
  toAiStatusPayload,
  type WatcherActionItem,
} from './watcherActionItems';

const COLORS = {
  background: '#F5F5F9',
  white: '#FFFFFF',
  black: '#0D0D0D',
  gray: '#636A74',
  lightGray: '#E1E1E7',
  activeCard: '#F3F5F8',
  shadow: 'rgba(0, 0, 0, 0.10)',
  borderGreen: '#8FC31F',
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Dance'>;
type TabType = 'default' | 'customization';

type DanceItem = WatcherActionItem;

const DEFAULT_ITEMS: DanceItem[] = WATCHER_ACTION_ITEMS;

const CUSTOM_ITEMS: DanceItem[] = [
  {
    id: 'custom-love',
    title: 'Love',
    imageSource: require('../../assets/images/dance/love.webp'),
    protocolStatus: 'love',
    actionFile: 'love',
    message: 'Love',
  },
];

const AddIcon: React.FC<{size: number}> = ({size}) => (
  <Svg width={size} height={size} viewBox="0 0 75 75" fill="none">
    <Rect
      x="1"
      y="1"
      width="73"
      height="73"
      rx="12"
      stroke={COLORS.borderGreen}
      strokeWidth="2"
    />
    <Path
      d="M37.5 25V50"
      stroke={COLORS.borderGreen}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <Path
      d="M25 37.5H50"
      stroke={COLORS.borderGreen}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </Svg>
);

export const DancePage: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const {windowWidth, scaleValue, verticalScaleValue} = useResponsiveScale();
  const {status, sendAiStatus} = useBluetooth();
  const isConnected = status === BluetoothStatus.Connected;
  const [selectedTab, setSelectedTab] = useState<TabType>('default');
  const [selectedItemId, setSelectedItemId] = useState(DEFAULT_ITEMS[0].id);

  const horizontalPadding = scaleValue(20, 18, 24);
  const sideInset = scaleValue(30, 24, 30);
  const contentWidth = windowWidth - horizontalPadding * 2;
  const cardWidth = Math.min(contentWidth, scaleValue(353, 326, 360));
  const tabTop = verticalScaleValue(22, 18, 26);
  const tabHeight = verticalScaleValue(50, 48, 52);
  const tabInnerHeight = verticalScaleValue(42, 40, 44);
  const heroTop = verticalScaleValue(40, 32, 46);
  const heroSize = Math.min(scaleValue(196, 182, 206), cardWidth * 0.56);
  const heroLabelTop = verticalScaleValue(16, 14, 18);
  const bottomCardTop = verticalScaleValue(28, 22, 32);
  const bottomCardPaddingTop = verticalScaleValue(16, 14, 18);
  const bottomCardPaddingHorizontal = scaleValue(16, 14, 18);
  const bottomCardBottom = insets.bottom + verticalScaleValue(18, 14, 24);
  const itemWidth = Math.floor(
    (cardWidth - bottomCardPaddingHorizontal * 2) / 3,
  );
  const itemImageSize = Math.min(
    scaleValue(85, 78, 88),
    itemWidth - scaleValue(22, 18, 24),
  );
  const addButtonSize = Math.min(scaleValue(75, 70, 80), itemWidth);

  const currentItems = selectedTab === 'default' ? DEFAULT_ITEMS : CUSTOM_ITEMS;

  const selectedItem = useMemo(
    () =>
      currentItems.find(item => item.id === selectedItemId) ?? currentItems[0],
    [currentItems, selectedItemId],
  );

  const handleSelectTab = (nextTab: TabType) => {
    setSelectedTab(nextTab);
    setSelectedItemId(
      nextTab === 'default' ? DEFAULT_ITEMS[0].id : CUSTOM_ITEMS[0].id,
    );
  };

  const handleActionPress = async (item: WatcherActionItem) => {
    setSelectedItemId(item.id);

    if (!isConnected) {
      return;
    }

    try {
      await sendAiStatus(toAiStatusPayload(item));
    } catch {
      // Ignore transient BLE errors and keep the selection state visible.
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.statusBarSpacer, {height: insets.top}]} />

      <WatcherHeader
        title="Dance"
        onBack={() => navigation.goBack()}
        sideInset={sideInset}
        backgroundColor={COLORS.background}
        rightSlot={
          <TouchableOpacity activeOpacity={0.8}>
            <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
              <Path
                d="M9 16.8403C6.8968 16.8403 4.91961 16.0253 3.43236 14.5453C1.94454 13.0643 1.125 11.0955 1.125 9.00021C1.125 6.90545 1.94457 4.93615 3.43182 3.45564C4.91907 1.97571 6.89626 1.16064 8.99946 1.16064C11.1027 1.16064 13.0798 1.97571 14.5665 3.45564C16.0549 4.93615 16.8739 6.90545 16.8739 8.99963C16.8745 11.0949 16.0549 13.0643 14.5665 14.5447C13.0804 16.0247 11.1032 16.8403 9 16.8403ZM9 2.28504C7.19607 2.28504 5.50069 2.98366 4.22608 4.25268C2.952 5.52055 2.25 7.20692 2.25 9.00018C2.25 10.7934 2.95143 12.4798 4.2255 13.7471C5.50012 15.0161 7.19549 15.7147 8.99943 15.7147C10.8028 15.7147 12.4987 15.0161 13.7734 13.7471C15.0474 12.4786 15.7494 10.7929 15.7489 8.9996C15.7489 7.20634 15.0474 5.52055 13.7734 4.25322C12.4993 2.98423 10.8034 2.28504 9 2.28504Z"
                fill="#000000"
              />
              <Path
                d="M12.9375 8.43752H9.56252V5.06252C9.56252 4.752 9.31051 4.5 9 4.5C8.68949 4.5 8.43748 4.752 8.43748 5.06252V8.43752H5.06252C4.752 8.43752 4.5 8.68952 4.5 9.00003C4.5 9.31054 4.752 9.56254 5.06252 9.56254H8.43752V12.9375C8.43752 13.2486 8.68952 13.5001 9.00003 13.5001C9.31054 13.5001 9.56254 13.2486 9.56254 12.9375V9.56252H12.9375C13.2486 9.56252 13.5001 9.31051 13.5001 9C13.5001 8.68949 13.2486 8.43752 12.9375 8.43752Z"
                fill="#000000"
              />
            </Svg>
          </TouchableOpacity>
        }
      />

      <View
        style={[
          styles.tabBar,
          {
            marginTop: tabTop,
            marginHorizontal: horizontalPadding,
            width: cardWidth,
            height: tabHeight,
          },
        ]}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.tabButton,
            {height: tabInnerHeight},
            selectedTab === 'default' && styles.tabButtonActive,
          ]}
          onPress={() => handleSelectTab('default')}>
          <Text
            style={[
              styles.tabText,
              selectedTab === 'default' && styles.tabTextActive,
            ]}>
            Default
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.tabButton,
            {height: tabInnerHeight},
            selectedTab === 'customization' && styles.tabButtonActive,
          ]}
          onPress={() => handleSelectTab('customization')}>
          <Text
            style={[
              styles.tabText,
              selectedTab === 'customization' && styles.tabTextActive,
            ]}>
            Customization
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.heroSection, {marginTop: heroTop}]}>
        <Image
          source={selectedItem.imageSource}
          style={{width: heroSize, height: heroSize}}
          resizeMode="contain"
        />
        <Text style={[styles.heroTitle, {marginTop: heroLabelTop}]}>
          {selectedItem.title}
        </Text>
      </View>

      <View
        style={[
          styles.bottomCard,
          {
            marginTop: bottomCardTop,
            marginHorizontal: horizontalPadding,
            width: cardWidth,
            paddingTop: bottomCardPaddingTop,
            paddingHorizontal: bottomCardPaddingHorizontal,
          },
        ]}>
        <Text style={styles.sectionTitle}>
          {selectedTab === 'default' ? 'Other' : 'My dance'}
        </Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{paddingBottom: bottomCardBottom}}>
          <View style={styles.grid}>
            {selectedTab === 'default'
              ? currentItems.map(item => {
                  const isActive = item.id === selectedItem.id;

                  return (
                    <TouchableOpacity
                      key={item.id}
                      testID={`dance-action-${item.id}`}
                      activeOpacity={0.9}
                      style={[
                        styles.gridItem,
                        {width: itemWidth},
                        isActive && styles.gridItemActive,
                      ]}
                      onPress={() => {
                        handleActionPress(item).catch(() => undefined);
                      }}>
                      <Image
                        source={item.imageSource}
                        style={{width: itemImageSize, height: itemImageSize}}
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
                  );
                })
              : (
                <>
                  {currentItems.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.9}
                      style={[
                        styles.gridItem,
                        {width: itemWidth},
                        item.id === selectedItem.id && styles.gridItemActive,
                      ]}
                      onPress={() => {
                        handleActionPress(item).catch(() => undefined);
                      }}>
                      <Image
                        source={item.imageSource}
                        style={{width: itemImageSize, height: itemImageSize}}
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

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.addButton,
                      {width: itemWidth, height: itemWidth},
                    ]}>
                    <AddIcon size={addButtonSize} />
                  </TouchableOpacity>

                  <View style={styles.gridSpacer} />
                </>
              )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  statusBarSpacer: {
    backgroundColor: COLORS.background,
  },
  tabBar: {
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: COLORS.lightGray,
    borderRadius: 30,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: COLORS.white,
    shadowColor: COLORS.shadow,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 1,
    shadowRadius: 8.4,
    elevation: 2,
  },
  tabText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 14,
    fontWeight: '400',
    color: COLORS.gray,
    textAlign: 'center',
    includeFontPadding: false,
  },
  tabTextActive: {
    fontWeight: '700',
    color: COLORS.black,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontFamily: 'SF Pro',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '500',
    color: COLORS.black,
    textAlign: 'center',
  },
  bottomCard: {
    flex: 1,
    alignSelf: 'center',
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sectionTitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: '#000000',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  gridItem: {
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  gridItemActive: {
    backgroundColor: COLORS.activeCard,
  },
  gridLabel: {
    fontFamily: 'Inter',
    width: '100%',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '400',
    color: '#000000',
    textAlign: 'center',
  },
  addButton: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridSpacer: {
    width: '33.3333%',
    height: 1,
  },
});
