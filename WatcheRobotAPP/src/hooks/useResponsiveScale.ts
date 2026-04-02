import {useWindowDimensions} from 'react-native';
import {RESPONSIVE_BASE, RESPONSIVE_SCALE_LIMITS} from '../utils/responsive';

const clamp = (value: number, min?: number, max?: number) => {
  if (typeof min === 'number' && value < min) {
    return min;
  }

  if (typeof max === 'number' && value > max) {
    return max;
  }

  return value;
};

export const useResponsiveScale = () => {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();

  // 基于设计稿尺寸计算当前设备的横向/纵向缩放系数
  // 对缩放系数做上下限约束，避免在特别小或特别大的机型上
  // 因为线性放大或缩小导致页面观感偏离设计稿太多。
  const widthScale = clamp(
    windowWidth / RESPONSIVE_BASE.width,
    RESPONSIVE_SCALE_LIMITS.width.min,
    RESPONSIVE_SCALE_LIMITS.width.max,
  );
  const heightScale = clamp(
    windowHeight / RESPONSIVE_BASE.height,
    RESPONSIVE_SCALE_LIMITS.height.min,
    RESPONSIVE_SCALE_LIMITS.height.max,
  );

  const scaleValue = (value: number, min?: number, max?: number) =>
    clamp(value * widthScale, min, max);

  const verticalScaleValue = (value: number, min?: number, max?: number) =>
    clamp(value * heightScale, min, max);

  // 统一暴露窗口尺寸和缩放工具，供 watcher 首页和 4 个子页复用
  return {
    windowWidth,
    windowHeight,
    widthScale,
    heightScale,
    scaleValue,
    verticalScaleValue,
  };
};
