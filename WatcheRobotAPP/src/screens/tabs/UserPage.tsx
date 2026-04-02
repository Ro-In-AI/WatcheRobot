import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {ClipPath, Defs, G, Path, Rect} from 'react-native-svg';
import {TabPageHeader} from '../../components/TabPageHeader';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import {BluetoothStatus, useBluetooth} from '../../modules/bluetooth';
import type {RootStackParamList} from '../../navigation/AppNavigator';
import {STORAGE_KEYS} from '../../utils/storageKeys';

const COLORS = {
  background: '#F5F5F9',
  white: '#FFFFFF',
  black: '#000000',
  title: '#1A1A1A',
  green: '#8FC31F',
  divider: '#EEF0F3',
  arrow: '#D5D7DD',
  value: '#000000',
  danger: '#D20706',
};

const AVATAR_IMAGE =
  'https://www.figma.com/api/mcp/asset/925facc3-9d08-44c9-aa5f-90c014138131';

type MenuItem = {
  id: string;
  label: string;
  icon: React.FC;
  value?: string;
  showChevron?: boolean;
};

type MenuSectionProps = {
  items: MenuItem[];
  onItemPress?: (item: MenuItem) => void;
  width: number;
  cardPaddingHorizontal: number;
  cardPaddingVertical: number;
  cardRadius: number;
  rowHeight: number;
  iconGap: number;
  menuRightGap: number;
  labelFontSize: number;
  labelLineHeight: number;
  valueFontSize: number;
  valueLineHeight: number;
  dividerMargin: number;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ChevronRightIcon: React.FC<{color?: string}> = ({color = COLORS.arrow}) => (
  <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
    <Path
      d="M4.25 2.25L7.75 6L4.25 9.75"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const ProfileArrowIcon: React.FC = () => <ChevronRightIcon color="#FFFFFF" />;

const LanguageIcon: React.FC = () => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <G clipPath="url(#language-clip)">
      <Path
        d="M14.1129 11.4132C14.6779 10.4035 15 9.23935 15 8C15 4.13401 11.866 1 8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15C9.73245 15 11.3179 14.3706 12.5402 13.3281"
        stroke="#000000"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <Path
        d="M7.99935 0.666687C10.2213 2.85535 11.3327 5.30002 11.3327 8.00002C11.3327 10.7 10.2213 13.1447 7.99935 15.3334C5.77735 13.1447 4.66602 10.7 4.66602 8.00002C4.66602 5.30002 5.77735 2.85535 7.99935 0.666687ZM7.99935 2.64269L7.83802 2.84669C6.60202 4.44602 5.99935 6.15335 5.99935 8.00002C5.99935 9.84669 6.60202 11.554 7.83802 13.1534L7.99935 13.3567L8.16068 13.1534C9.34268 11.6234 9.94602 9.99402 9.99602 8.24002L9.99935 8.00002C9.99935 6.15402 9.39668 4.44602 8.16068 2.84669L7.99935 2.64269Z"
        fill="#000000"
      />
      <Path d="M1.33398 7.33331H14.6673V8.66665H1.33398V7.33331Z" fill="#000000" />
    </G>
    <Defs>
      <ClipPath id="language-clip">
        <Rect width={16} height={16} fill="#FFFFFF" />
      </ClipPath>
    </Defs>
  </Svg>
);

const ModelSettingsIcon: React.FC = () => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path
      d="M4.79883 12.6596C4.92083 12.6596 5.03873 12.7081 5.125 12.7944C5.21114 12.8805 5.25965 12.9977 5.25977 13.1196C5.25977 13.2416 5.21127 13.3595 5.125 13.4457C5.03874 13.532 4.92082 13.5795 4.79883 13.5795C4.67702 13.5794 4.55979 13.5319 4.47363 13.4457C4.38737 13.3595 4.33887 13.2416 4.33887 13.1196C4.33898 12.9977 4.38748 12.8805 4.47363 12.7944C4.55979 12.7082 4.677 12.6597 4.79883 12.6596ZM1.83887 13.06H2.70312C2.70244 13.0799 2.69922 13.0997 2.69922 13.1196C2.69922 13.1397 2.70243 13.1601 2.70312 13.1801H1.83887C1.82314 13.18 1.80802 13.1737 1.79688 13.1625C1.78562 13.1513 1.7793 13.1355 1.7793 13.1196C1.77941 13.1038 1.78572 13.0887 1.79688 13.0776C1.80803 13.0664 1.82311 13.0601 1.83887 13.06ZM14.1592 13.06C14.1751 13.06 14.1909 13.0663 14.2021 13.0776C14.2132 13.0887 14.2196 13.1039 14.2197 13.1196C14.2197 13.1354 14.2133 13.1513 14.2021 13.1625C14.1909 13.1738 14.1751 13.1801 14.1592 13.1801H6.89551C6.8962 13.1601 6.89941 13.1397 6.89941 13.1196C6.89941 13.0997 6.89619 13.0799 6.89551 13.06H14.1592ZM11.1992 7.8598C11.3211 7.8598 11.4382 7.9084 11.5244 7.99457C11.6106 8.08078 11.6591 8.19785 11.6592 8.31976C11.6592 8.44173 11.6106 8.5587 11.5244 8.64496C11.4381 8.73122 11.3212 8.77972 11.1992 8.77972C11.0772 8.7797 10.9603 8.73121 10.874 8.64496C10.7879 8.55871 10.7393 8.44169 10.7393 8.31976C10.7393 8.19785 10.7878 8.08078 10.874 7.99457C10.9603 7.90837 11.0773 7.85982 11.1992 7.8598ZM1.83887 8.26019H9.10352C9.10283 8.28006 9.09961 8.29985 9.09961 8.31976C9.09961 8.33992 9.10282 8.3602 9.10352 8.38031H1.83887C1.82318 8.3802 1.80801 8.37379 1.79688 8.36273C1.78562 8.35148 1.7793 8.33568 1.7793 8.31976C1.77936 8.30398 1.78574 8.28896 1.79688 8.27777C1.80802 8.26662 1.82311 8.26031 1.83887 8.26019ZM14.1592 8.26019C14.1751 8.26019 14.1909 8.26652 14.2021 8.27777C14.2132 8.28894 14.2197 8.30408 14.2197 8.31976C14.2197 8.33565 14.2134 8.35148 14.2021 8.36273C14.1909 8.37398 14.1751 8.38031 14.1592 8.38031H13.2949C13.2956 8.3602 13.2988 8.33993 13.2988 8.31976C13.2988 8.29985 13.2956 8.28006 13.2949 8.26019H14.1592ZM4.79883 3.06C4.85924 3.06 4.91978 3.07204 4.97559 3.09515C5.03129 3.11827 5.08235 3.15212 5.125 3.19476C5.1676 3.23743 5.20153 3.28847 5.22461 3.34418C5.24764 3.39989 5.25976 3.45967 5.25977 3.51996C5.25977 3.58023 5.24763 3.64003 5.22461 3.69574C5.20154 3.75143 5.16759 3.8025 5.125 3.84515C5.08236 3.88779 5.03128 3.92165 4.97559 3.94476C4.91978 3.96788 4.85924 3.97992 4.79883 3.97992C4.677 3.9798 4.55979 3.93131 4.47363 3.84515C4.38752 3.75891 4.33887 3.64184 4.33887 3.51996C4.33888 3.39807 4.38751 3.281 4.47363 3.19476C4.5383 3.13009 4.62061 3.08648 4.70898 3.06879L4.79883 3.06ZM1.83887 3.46039H2.70312C2.70245 3.48025 2.69922 3.50005 2.69922 3.51996C2.69922 3.53985 2.70245 3.55968 2.70312 3.57953H1.83887C1.82311 3.57942 1.80802 3.5731 1.79688 3.56195C1.78577 3.55072 1.7793 3.53576 1.7793 3.51996C1.77931 3.50415 1.78575 3.48919 1.79688 3.47797C1.80802 3.46682 1.82311 3.4605 1.83887 3.46039ZM14.1592 3.46039C14.1751 3.46039 14.1909 3.46671 14.2021 3.47797C14.2131 3.48917 14.2197 3.50425 14.2197 3.51996C14.2197 3.53566 14.2131 3.55074 14.2021 3.56195C14.1909 3.5732 14.1751 3.57953 14.1592 3.57953H6.89551C6.89619 3.55968 6.89941 3.53985 6.89941 3.51996C6.89941 3.50005 6.89619 3.48025 6.89551 3.46039H14.1592Z"
      fill="#000000"
      stroke="#000000"
    />
  </Svg>
);

const PrivacyIcon: React.FC = () => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <G clipPath="url(#privacy-clip)">
      <Path
        d="M7.93616 5.54598C8.17907 5.54582 8.41582 5.62244 8.61257 5.76491C8.80932 5.90737 8.956 6.10838 9.03165 6.33921C9.1073 6.57005 9.10805 6.81888 9.03379 7.05017C8.95952 7.28145 8.81405 7.48334 8.61816 7.62698V9.79198C8.61816 9.96729 8.54852 10.1354 8.42456 10.2594C8.3006 10.3833 8.13247 10.453 7.95716 10.453C7.78185 10.453 7.61373 10.3833 7.48976 10.2594C7.3658 10.1354 7.29616 9.96729 7.29616 9.79198V7.65698C7.08922 7.5205 6.93192 7.32081 6.8477 7.08766C6.76348 6.85451 6.75685 6.60038 6.82881 6.36316C6.90076 6.12594 7.04744 5.91832 7.24699 5.77124C7.44654 5.62416 7.68827 5.5445 7.93616 5.54598Z"
        fill="#000000"
      />
      <Path
        d="M11.2576 14C10.4283 14.5709 9.36274 15.0912 8 15.5C3 14 2 11 2 9.49999V3C3.33333 2.83333 6.4 2.6 8 1C8.5 1.5 10.5 3 14 3C14 4.5 14 7.5 14 9.49999C14 10.2322 13.7617 11.3219 12.9361 12.4201"
        stroke="#000000"
        strokeLinecap="round"
      />
    </G>
    <Defs>
      <ClipPath id="privacy-clip">
        <Rect width={16} height={16} fill="#FFFFFF" />
      </ClipPath>
    </Defs>
  </Svg>
);

const WatcherSettingsIcon: React.FC = () => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path
      d="M3.70313 6.80471C3.39375 6.80315 3.14219 6.55159 3.14062 6.24221V4.94846C3.14219 2.82659 4.86094 1.10627 6.98438 1.10315C8.7875 1.10315 10.3641 2.37034 10.7438 4.11565C10.7766 4.26252 10.7484 4.41721 10.6672 4.54534C10.5844 4.6719 10.4563 4.76096 10.3078 4.79221C10.1609 4.82502 10.0063 4.7969 9.87969 4.71565C9.75313 4.6344 9.66406 4.50471 9.63281 4.35627C9.35156 3.11252 8.24688 2.22971 6.97188 2.22815C5.47031 2.22971 4.25469 3.4469 4.25469 4.94846V6.24221C4.25937 6.39065 4.20469 6.53596 4.1 6.64221C3.99687 6.74846 3.85313 6.80784 3.70469 6.80627V6.80471H3.70313Z"
      fill="#000000"
    />
    <Path
      d="M10.9547 14.9H2.90156C2.01406 14.9 1.29688 14.1969 1.29688 13.3375V7.28436C1.29688 6.42499 2.01562 5.72186 2.90156 5.72186H8.67344C8.98437 5.72186 9.23594 5.97499 9.2375 6.28592C9.2375 6.59686 8.98437 6.84843 8.67344 6.84999H2.90156C2.64844 6.84999 2.42344 7.06092 2.42344 7.28592V13.3406C2.42344 13.5797 2.64844 13.7766 2.90156 13.7766H10.9547C11.2078 13.7766 11.4328 13.5656 11.4328 13.3406V8.79061C11.4344 8.47967 11.6859 8.22811 11.9969 8.22811C12.3062 8.22967 12.5578 8.47967 12.5594 8.79061V13.3391C12.5594 14.1969 11.8406 14.9 10.9547 14.9Z"
      fill="#000000"
    />
    <Path
      d="M7.02734 12C6.87891 11.9985 6.73672 11.9375 6.63359 11.8313C6.52578 11.725 6.46484 11.5813 6.46484 11.4297C6.46484 11.2781 6.52578 11.1344 6.63359 11.0281L13.743 3.88909C13.8492 3.78127 13.993 3.72034 14.1445 3.72034C14.2961 3.72034 14.4398 3.78127 14.5461 3.88909C14.7711 4.11565 14.7711 4.46721 14.5461 4.69221L7.43516 11.8328C7.32467 11.9372 7.17932 11.9968 7.02734 12Z"
      fill="#000000"
    />
  </Svg>
);

const VersionIcon: React.FC = () => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <G clipPath="url(#info-clip)">
      <Path
        d="M14.1129 11.4132C14.6779 10.4035 15 9.23935 15 8C15 4.13401 11.866 1 8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15C9.73245 15 11.3179 14.3706 12.5402 13.3281"
        stroke="#000000"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <Path
        d="M7.78674 6.09447C8.02247 6.09447 8.23464 6.00804 8.39965 5.84302C8.57253 5.678 8.65896 5.4737 8.65896 5.24582C8.65896 5.01009 8.57253 4.81364 8.39965 4.64862C8.23464 4.49147 8.02247 4.40503 7.78674 4.40503C7.54314 4.40503 7.33884 4.49147 7.17382 4.64862C7.00881 4.81364 6.92237 5.01794 6.92237 5.24582C6.92237 5.4737 7.00881 5.678 7.17382 5.84302C7.33884 6.00804 7.551 6.09447 7.78674 6.09447ZM9.10686 11.0606C8.95756 11.0371 8.85541 10.9978 8.8004 10.9428C8.7454 10.8956 8.72182 10.7778 8.72182 10.5892L8.73754 9.49693C8.73754 8.28682 8.72968 7.43031 8.71397 6.95884V6.84097L6.96166 6.95098L6.85951 6.9667C6.56091 6.99027 6.49805 7.12385 6.49805 7.22601C6.49805 7.29673 6.53734 7.46174 6.85951 7.49317C7.12668 7.52461 7.18168 7.57961 7.18954 7.58747C7.20526 7.6189 7.2524 7.74462 7.27598 8.37325C7.29169 8.82115 7.29955 9.33977 7.29955 10.0077C7.29955 10.4713 7.28383 10.762 7.2524 10.8956C7.22883 10.9978 7.11882 11.0528 6.91451 11.0685C6.56877 11.0921 6.49805 11.2257 6.49805 11.3435C6.49805 11.4221 6.52948 11.595 6.84379 11.595C6.89094 11.595 6.96952 11.5871 7.09525 11.5714C7.26026 11.5557 7.44099 11.5478 7.6453 11.5478C8.10105 11.5478 8.4468 11.5557 8.77683 11.5793L8.94185 11.5871C9.03614 11.595 9.10686 11.595 9.16187 11.595C9.2483 11.595 9.37403 11.5871 9.44475 11.5085C9.47618 11.4771 9.50761 11.4221 9.49976 11.3435C9.4919 11.1864 9.35831 11.0921 9.10686 11.0606Z"
        fill="#000000"
      />
    </G>
    <Defs>
      <ClipPath id="info-clip">
        <Rect width={16} height={16} fill="#FFFFFF" />
      </ClipPath>
    </Defs>
  </Svg>
);

const ResetIcon: React.FC = () => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <G clipPath="url(#reset-clip)">
      <Path
        d="M14.1129 11.4132C14.6779 10.4035 15 9.23935 15 8C15 4.13401 11.866 1 8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15C9.3071 15 10.5305 14.6417 11.5774 14.0181"
        stroke="#000000"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <Path
        d="M15.7456 11.0336L13.1098 9.68843C13.0577 9.66209 12.9991 9.65173 12.9412 9.65865C12.8832 9.66558 12.8287 9.68948 12.7843 9.72736C12.74 9.76523 12.7078 9.81538 12.6919 9.87149C12.676 9.9276 12.6771 9.98716 12.6949 10.0427L13.3414 12.0304C13.3656 12.1049 13.4184 12.1666 13.4881 12.2022C13.5578 12.2378 13.6388 12.2442 13.7132 12.2202L15.7026 11.5775C15.7583 11.5596 15.8075 11.5255 15.8438 11.4796C15.8801 11.4337 15.902 11.378 15.9066 11.3197C15.9112 11.2613 15.8984 11.2029 15.8698 11.1518C15.8412 11.1007 15.7981 11.0593 15.7459 11.0328L15.7456 11.0336Z"
        fill="#000000"
      />
    </G>
    <Defs>
      <ClipPath id="reset-clip">
        <Rect width={16} height={16} fill="#FFFFFF" />
      </ClipPath>
    </Defs>
  </Svg>
);

const GENERAL_ITEMS: MenuItem[] = [
  {id: 'language', label: 'Language', value: 'En', icon: LanguageIcon, showChevron: true},
  {id: 'model-settings', label: 'Model settings', icon: ModelSettingsIcon, showChevron: true},
];

const WATCHER_ITEMS: MenuItem[] = [
  {id: 'privacy-settings', label: 'Privacy Settings', icon: PrivacyIcon, showChevron: true},
  {
    id: 'watcher-settings',
    label: 'My Watcher Settings',
    icon: WatcherSettingsIcon,
    showChevron: true,
  },
];

const APP_ITEMS: MenuItem[] = [
  {id: 'current-version', label: 'Current Version', value: '1.0', icon: VersionIcon},
  {id: 'factory-reset', label: 'Factory data reset', icon: ResetIcon},
];

const MenuSection: React.FC<MenuSectionProps> = ({
  items,
  onItemPress,
  width,
  cardPaddingHorizontal,
  cardPaddingVertical,
  cardRadius,
  rowHeight,
  iconGap,
  menuRightGap,
  labelFontSize,
  labelLineHeight,
  valueFontSize,
  valueLineHeight,
  dividerMargin,
}) => (
  <View
    style={[
      styles.menuCard,
      {
        width,
        borderRadius: cardRadius,
        paddingHorizontal: cardPaddingHorizontal,
        paddingVertical: cardPaddingVertical,
      },
    ]}>
    {items.map((item, index) => {
      const Icon = item.icon;
      const isLast = index === items.length - 1;

      return (
        <View key={item.id}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.menuRow, {minHeight: rowHeight}]}
            onPress={() => onItemPress?.(item)}>
            <View style={[styles.menuLeft, {gap: iconGap}]}>
              <Icon />
              <Text style={[styles.menuLabel, {fontSize: labelFontSize, lineHeight: labelLineHeight}]}>
                {item.label}
              </Text>
            </View>

            <View style={[styles.menuRight, {gap: menuRightGap}]}>
              {item.value ? (
                <Text
                  style={[
                    styles.menuValue,
                    {fontSize: valueFontSize, lineHeight: valueLineHeight},
                  ]}>
                  {item.value}
                </Text>
              ) : null}
              {item.showChevron ? <ChevronRightIcon /> : null}
            </View>
          </TouchableOpacity>

          {!isLast ? <View style={[styles.menuDivider, {marginVertical: dividerMargin}]} /> : null}
        </View>
      );
    })}
  </View>
);

export const UserPage: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const {windowWidth, scaleValue, verticalScaleValue} = useResponsiveScale();
  const {status: bluetoothStatus, disconnect, clearAll, clearWifiConfig} =
    useBluetooth();

  const horizontalPadding = scaleValue(20, 18, 24);
  const contentWidth = Math.min(
    windowWidth - horizontalPadding * 2,
    scaleValue(353, 333, 353),
  );
  const sectionTopPadding = verticalScaleValue(10, 8, 14);
  const headerBottom = verticalScaleValue(20, 16, 22);
  const headerTitleInset = scaleValue(8, 6, 10);
  const avatarSize = scaleValue(80, 72, 82);
  const profileBottom = verticalScaleValue(24, 20, 26);
  const profileGap = scaleValue(10, 8, 12);
  const profileTopOffset = verticalScaleValue(16, 12, 16);
  const profileButtonTop = verticalScaleValue(8, 6, 10);
  const profileNameFontSize = scaleValue(20, 18, 20);
  const profileNameLineHeight = verticalScaleValue(20, 18, 20);
  const profileButtonHeight = verticalScaleValue(20, 18, 22);
  const profileButtonGap = scaleValue(2, 2, 4);
  const profileButtonFontSize = scaleValue(12, 11, 12);
  const profileButtonLineHeight = verticalScaleValue(12, 11, 12);
  const profileButtonPaddingLeft = scaleValue(8, 8, 10);
  const profileButtonPaddingRight = scaleValue(4, 4, 6);
  const sectionGap = verticalScaleValue(12, 10, 14);
  const cardPaddingHorizontal = scaleValue(16, 14, 18);
  const cardPaddingVertical = verticalScaleValue(16, 14, 18);
  const cardRadius = scaleValue(16, 14, 16);
  const rowHeight = verticalScaleValue(16, 16, 18);
  const iconGap = scaleValue(8, 8, 10);
  const menuRightGap = scaleValue(8, 6, 8);
  const menuFontSize = scaleValue(16, 14, 16);
  const menuLineHeight = verticalScaleValue(16, 14, 16);
  const menuValueFontSize = scaleValue(14, 12, 14);
  const menuValueLineHeight = verticalScaleValue(14, 12, 14);
  const dividerMargin = verticalScaleValue(12, 10, 12);
  const logoutHeight = verticalScaleValue(48, 44, 48);
  const logoutFontSize = scaleValue(16, 14, 16);
  const logoutLineHeight = verticalScaleValue(24, 20, 24);
  const bottomSpacing = insets.bottom + verticalScaleValue(110, 96, 122);

  const handleFactoryReset = () => {
    Alert.alert(
      'Factory data reset',
      'This will remove the current Watcher binding state on this phone, clear the last connected device cache, and try to erase the saved Wi-Fi credentials on the robot.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              let clearedRobotWifi = false;

              if (bluetoothStatus === BluetoothStatus.Connected) {
                try {
                  await clearWifiConfig();
                  clearedRobotWifi = true;
                } catch {}
              }

              await disconnect().catch(() => {});
              await AsyncStorage.multiRemove([
                STORAGE_KEYS.hasCompletedInitialBinding,
                STORAGE_KEYS.lastConnectedDeviceId,
              ]);
              clearAll();

              if (clearedRobotWifi) {
                Alert.alert(
                  'Reset complete',
                  'Local Watcher data and the robot’s saved Wi-Fi credentials were cleared. You can now add a new robot from the binding flow.',
                );
                return;
              }

              Alert.alert(
                'Reset complete',
                bluetoothStatus === BluetoothStatus.Connected
                  ? 'Local Watcher data was cleared, but the robot Wi-Fi reset was not confirmed. You can reconnect and try again if needed.'
                  : 'Local Watcher data was cleared. To erase the robot’s saved Wi-Fi too, connect to the robot and run reset again.',
              );
            } catch {
              Alert.alert(
                'Reset failed',
                'Unable to clear local Watcher data. Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const handleMenuItemPress = (item: MenuItem) => {
    switch (item.id) {
      case 'language':
        navigation.navigate('Language');
        return;
      case 'model-settings':
        navigation.navigate('ModelSettings');
        return;
      case 'privacy-settings':
        navigation.navigate('PrivacySettings');
        return;
      case 'watcher-settings':
        Alert.alert(
          'My Watcher Settings',
          'Watcher settings are not connected yet.',
        );
        return;
      case 'current-version':
        Alert.alert('Current Version', 'Current version: 1.0');
        return;
      case 'factory-reset':
        handleFactoryReset();
        return;
      default:
        return;
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: bottomSpacing,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <TabPageHeader
          topInset={insets.top + sectionTopPadding}
          horizontalPadding={horizontalPadding}
          title="User"
          titleInset={headerTitleInset}
          showBell={false}
        />

        <View
          style={[
            styles.profileSection,
            {
              width: contentWidth,
              marginTop: headerBottom,
              marginBottom: profileBottom,
            },
          ]}>
          <Image
            source={{uri: AVATAR_IMAGE}}
            style={[
              styles.avatar,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
              },
            ]}
          />

          <View
            style={[
              styles.profileContent,
              {
                marginLeft: profileGap,
                paddingTop: profileTopOffset,
              },
            ]}>
            <Text
              style={[
                styles.profileName,
                {fontSize: profileNameFontSize, lineHeight: profileNameLineHeight},
              ]}>
              Dave
            </Text>

            <TouchableOpacity
              style={[
                styles.profileButton,
                {
                  height: profileButtonHeight,
                  borderRadius: profileButtonHeight / 2,
                  gap: profileButtonGap,
                  marginTop: profileButtonTop,
                  paddingLeft: profileButtonPaddingLeft,
                  paddingRight: profileButtonPaddingRight,
                },
              ]}
              activeOpacity={0.85}>
              <Text
                style={[
                  styles.profileButtonText,
                  {
                    fontSize: profileButtonFontSize,
                    lineHeight: profileButtonLineHeight,
                  },
                ]}>
                Profile
              </Text>
              <ProfileArrowIcon />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{gap: sectionGap}}>
          <MenuSection
            items={GENERAL_ITEMS}
            onItemPress={handleMenuItemPress}
              width={contentWidth}
              cardPaddingHorizontal={cardPaddingHorizontal}
              cardPaddingVertical={cardPaddingVertical}
              cardRadius={cardRadius}
              rowHeight={rowHeight}
              iconGap={iconGap}
              menuRightGap={menuRightGap}
              labelFontSize={menuFontSize}
              labelLineHeight={menuLineHeight}
              valueFontSize={menuValueFontSize}
              valueLineHeight={menuValueLineHeight}
              dividerMargin={dividerMargin}
            />
          <MenuSection
            items={WATCHER_ITEMS}
            onItemPress={handleMenuItemPress}
            width={contentWidth}
            cardPaddingHorizontal={cardPaddingHorizontal}
            cardPaddingVertical={cardPaddingVertical}
            cardRadius={cardRadius}
            rowHeight={rowHeight}
            iconGap={iconGap}
            menuRightGap={menuRightGap}
            labelFontSize={menuFontSize}
            labelLineHeight={menuLineHeight}
            valueFontSize={menuValueFontSize}
            valueLineHeight={menuValueLineHeight}
            dividerMargin={dividerMargin}
          />
          <MenuSection
            items={APP_ITEMS}
            onItemPress={handleMenuItemPress}
            width={contentWidth}
            cardPaddingHorizontal={cardPaddingHorizontal}
            cardPaddingVertical={cardPaddingVertical}
            cardRadius={cardRadius}
            rowHeight={rowHeight}
            iconGap={iconGap}
            menuRightGap={menuRightGap}
            labelFontSize={menuFontSize}
            labelLineHeight={menuLineHeight}
            valueFontSize={menuValueFontSize}
            valueLineHeight={menuValueLineHeight}
            dividerMargin={dividerMargin}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.logoutButton,
            {
              width: contentWidth,
              height: logoutHeight,
              borderRadius: cardRadius,
              marginTop: sectionGap + verticalScaleValue(4, 2, 6),
            },
          ]}
          activeOpacity={0.85}>
          <Text
            style={[
              styles.logoutText,
              {fontSize: logoutFontSize, lineHeight: logoutLineHeight},
            ]}>
            Log out
          </Text>
        </TouchableOpacity>
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
  pageTitle: {
    fontFamily: 'Inter',
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '700',
    color: COLORS.black,
    letterSpacing: -0.3,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    backgroundColor: '#E6E7EB',
  },
  profileContent: {
    justifyContent: 'flex-start',
  },
  profileName: {
    fontFamily: 'Inter',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '500',
    color: COLORS.title,
  },
  profileButton: {
    backgroundColor: COLORS.green,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  profileButtonText: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '400',
    color: COLORS.white,
  },
  menuCard: {
    backgroundColor: COLORS.white,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuLabel: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '400',
    color: COLORS.black,
  },
  menuValue: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '400',
    color: COLORS.value,
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
  },
  logoutButton: {
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    color: COLORS.danger,
  },
});
