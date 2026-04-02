import React from 'react';
import {Image, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import type {RootStackParamList} from '../../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'VisitingSession'
>;

type RouteProps = RouteProp<RootStackParamList, 'VisitingSession'>;

const COLORS = {
  background: '#FFFFFF',
  black: '#000000',
  green: '#8FC31F',
  subText: '#363C44',
};

// 访问中页面作为流程终点页，展示当前访问状态和结束按钮。
export const VisitSessionPage: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const {scaleValue, verticalScaleValue, windowWidth} = useResponsiveScale();

  // 页面文案由上游流程传入；如果没有传值，则使用默认提示。
  const statusText = route.params?.statusText ?? '[Crab A] is visiting...';
  const buttonLabel = route.params?.buttonLabel ?? 'End the visit.';
  const horizontalPadding = scaleValue(30, 24, 30);
  const imageSize = Math.min(windowWidth * 0.52, scaleValue(204, 186, 214));

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      <View style={styles.content}>
        <Image
          source={require('../../assets/images/robot_watcher.png')}
          style={{width: imageSize, height: imageSize}}
          resizeMode="contain"
        />

        {/* 中间文案用于展示当前是谁在访问，以及访问中的状态。 */}
        <Text
          style={[
            styles.statusText,
            {marginTop: verticalScaleValue(22, 18, 24)},
          ]}>
          {statusText}
        </Text>
      </View>

      {/* 底部按钮用于结束当前访问，返回到上一层页面。 */}
      <TouchableOpacity
        style={[
          styles.endButton,
          {
            left: horizontalPadding,
            right: horizontalPadding,
            bottom: insets.bottom + verticalScaleValue(34, 26, 38),
          },
        ]}
        activeOpacity={0.88}
        onPress={() => navigation.goBack()}>
        <Text style={styles.endButtonText}>{buttonLabel}</Text>
      </TouchableOpacity>
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
    justifyContent: 'center',
    paddingBottom: 72,
  },
  statusText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '400',
    color: COLORS.subText,
    textAlign: 'center',
  },
  endButton: {
    position: 'absolute',
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endButtonText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '600',
    color: COLORS.black,
  },
});
