import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';

type WatcherHeaderProps = {
  title: string;
  onBack: () => void;
  sideInset: number;
  backgroundColor?: string;
  titleColor?: string;
  iconColor?: string;
  rightSlot?: React.ReactNode;
};

const BackIcon: React.FC<{color?: string}> = ({color = '#000000'}) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9.23544 11.9995L17.3905 19.8827C17.8711 20.3481 17.8711 21.1014 17.3905 21.5653C16.9098 22.03 16.13 22.03 15.6494 21.5653L6.62452 12.8406C6.14458 12.376 6.14458 11.6223 6.62452 11.1591L15.6494 2.43481C15.8905 2.20246 16.2055 2.0863 16.5207 2.0863C16.8358 2.0863 17.1509 2.20248 17.3905 2.43555C17.8711 2.90024 17.8711 3.65242 17.3905 4.1171L9.23544 11.9995Z"
      fill={color}
    />
  </Svg>
);

export const WatcherHeader: React.FC<WatcherHeaderProps> = ({
  title,
  onBack,
  sideInset,
  backgroundColor = '#FFFFFF',
  titleColor = '#1A1A1A',
  iconColor = '#000000',
  rightSlot,
}) => (
  <View style={[styles.header, {backgroundColor}]}>
    <View style={styles.headerContent}>
      {/* 返回按钮 */}
      {/* 左右操作位用绝对定位，保证标题始终保持视觉居中。 */}
      <TouchableOpacity
        style={[styles.headerButton, {left: sideInset}]}
        onPress={onBack}
        activeOpacity={0.8}>
        <BackIcon color={iconColor} />
      </TouchableOpacity>

      {/* 中间标题 */}
      <Text style={[styles.headerTitle, {color: titleColor}]}>{title}</Text>

      {rightSlot ? (
        /* 右侧扩展操作位 */
        <View style={[styles.rightSlot, {right: sideInset}]}>{rightSlot}</View>
      ) : null}
    </View>
  </View>
);

const styles = StyleSheet.create({
  header: {
    width: '100%',
    height: 44,
    justifyContent: 'center',
  },
  headerContent: {
    width: '100%',
    minHeight: 26,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerButton: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightSlot: {
    position: 'absolute',
    top: 0,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'SF Pro',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '500',
    color: '#1A1A1A',
    textAlign: 'center',
  },
});
