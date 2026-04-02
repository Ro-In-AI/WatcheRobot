/* eslint-env jest */

global.__reanimatedWorkletInit = () => {};

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaProvider: ({children}) => children,
    SafeAreaConsumer: ({children}) =>
      children({top: 0, right: 0, bottom: 0, left: 0}),
    useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
    useSafeAreaFrame: () => ({x: 0, y: 0, width: 390, height: 844}),
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const mockComponent = name => {
    const Component = props => React.createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  };

  return {
    __esModule: true,
    default: mockComponent('Svg'),
    Svg: mockComponent('Svg'),
    Path: mockComponent('Path'),
    Circle: mockComponent('Circle'),
    Rect: mockComponent('Rect'),
    Ellipse: mockComponent('Ellipse'),
  };
});

jest.mock('react-native-ble-plx', () => ({
  BleErrorCode: {
    OperationCancelled: 'OperationCancelled',
  },
  BleManager: jest.fn().mockImplementation(() => ({
    state: jest.fn(),
    onStateChange: jest.fn(),
    startDeviceScan: jest.fn(),
    stopDeviceScan: jest.fn(),
    devices: jest.fn(),
    isDeviceConnected: jest.fn(),
  })),
}));
