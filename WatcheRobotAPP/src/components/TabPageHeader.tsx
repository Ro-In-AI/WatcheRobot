import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';

const BellIcon: React.FC = () => (
  <Svg width={18} height={18} viewBox="0 0 14 16" fill="none">
    <Path
      d="M6.07725 14.0625L6.075 14.0873C6.07503 14.2473 6.13195 14.4022 6.23561 14.5242C6.33926 14.6462 6.4829 14.7274 6.64087 14.7533L6.75 14.7622C6.84076 14.7623 6.93061 14.7441 7.01416 14.7086C7.09771 14.6731 7.17325 14.6212 7.23627 14.5559C7.29928 14.4906 7.34847 14.4132 7.3809 14.3284C7.41333 14.2436 7.42833 14.1532 7.425 14.0625H8.4375C8.43729 14.4959 8.27035 14.9125 7.97129 15.2262C7.67223 15.5398 7.26396 15.7264 6.8311 15.7472C6.39823 15.768 5.97394 15.6215 5.64615 15.3381C5.31836 15.0546 5.11219 14.6558 5.07037 14.2245L5.0625 14.0625H6.07725ZM7.335 0V1.15538C8.71804 1.3 9.99849 1.95178 10.9292 2.98495C11.86 4.01812 12.375 5.35942 12.375 6.75V12.3739L13.5 12.375V13.5L12.375 13.4989V13.5H1.125V13.4989L0 13.5V12.375L1.125 12.3739V6.75C1.1249 5.35606 1.64238 4.01173 2.57711 2.97763C3.51185 1.94354 4.79725 1.29336 6.18413 1.15313L6.18525 0H7.335ZM6.75 2.25C5.55653 2.25 4.41193 2.72411 3.56802 3.56802C2.72411 4.41193 2.25 5.55653 2.25 6.75V12.3739H11.25V6.75C11.25 5.55653 10.7759 4.41193 9.93198 3.56802C9.08807 2.72411 7.94347 2.25 6.75 2.25Z"
      fill="#000000"
    />
  </Svg>
);

type TabPageHeaderProps = {
  topInset: number;
  horizontalPadding: number;
  title?: string;
  titleInset?: number;
  onPressBell?: () => void;
  onLongPressBell?: () => void;
  showBell?: boolean;
  leftSlot?: React.ReactNode;
};

export const TabPageHeader: React.FC<TabPageHeaderProps> = ({
  topInset,
  horizontalPadding,
  title,
  titleInset = 0,
  onPressBell,
  onLongPressBell,
  showBell = true,
  leftSlot,
}) => (
  <>
    <View style={{height: topInset}} />
    <View style={{width: '100%', paddingHorizontal: horizontalPadding}}>
      <View style={styles.header}>
        {leftSlot ? (
          leftSlot
        ) : (
          <View style={[styles.headerLeft, {marginLeft: titleInset}]}>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>
        )}

        {showBell ? (
          <TouchableOpacity
            style={styles.headerBell}
            activeOpacity={0.8}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            onPress={onPressBell}
            onLongPress={onLongPressBell}>
            <BellIcon />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  </>
);

const styles = StyleSheet.create({
  header: {
    width: '100%',
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
  },
  headerTitle: {
    fontFamily: 'Inter',
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '700',
    color: '#000000',
  },
  headerBell: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
