import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {MotionPage} from '../../src/screens/watcher/MotionPage';

const mockSendServoAngle = jest.fn();
const mockSendAiStatus = jest.fn();

jest.mock('../../src/components/WatcherHeader', () => ({
  WatcherHeader: () => null,
}));

jest.mock('../../src/hooks/useResponsiveScale', () => ({
  useResponsiveScale: () => ({
    windowWidth: 390,
    scaleValue: (value: number) => value,
    verticalScaleValue: (value: number) => value,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: jest.fn(),
  }),
}));

jest.mock('../../src/modules/bluetooth', () => ({
  BluetoothStatus: {
    Connected: 'connected',
  },
  SERVO_CONFIG: {
    AXIS_X_DEFAULT_ANGLE: 90,
    AXIS_Y_DEFAULT_ANGLE: 90,
    ANGLE_MIN: 0,
    ANGLE_MAX: 180,
    STEP_INTERVAL_MS: 120,
  },
  useBluetooth: () => ({
    status: 'connected',
    sendServoAngle: mockSendServoAngle,
    sendAiStatus: mockSendAiStatus,
  }),
}));

describe('MotionPage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSendServoAngle.mockReset();
    mockSendAiStatus.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderPage = async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<MotionPage />);
    });

    return renderer!;
  };

  it('sends stepped servo angle commands while a direction is pressed', async () => {
    const renderer = await renderPage();
    const upButton = renderer.root.findByProps({testID: 'motion-direction-up'});

    await act(async () => {
      upButton.props.onPressIn();
    });

    expect(mockSendServoAngle).toHaveBeenCalledWith({yDeg: 100});

    await act(async () => {
      jest.advanceTimersByTime(240);
    });

    expect(mockSendServoAngle).toHaveBeenCalledWith({yDeg: 110});
    expect(mockSendServoAngle).toHaveBeenCalledWith({yDeg: 120});

    await act(async () => {
      upButton.props.onPressOut();
      jest.advanceTimersByTime(240);
    });

    expect(mockSendServoAngle).toHaveBeenCalledTimes(3);
  });

  it('sends ai status for action cards', async () => {
    const renderer = await renderPage();
    const actionCard = renderer.root.findByProps({testID: 'motion-action-thinking'});

    await act(async () => {
      actionCard.props.onPress();
    });

    expect(mockSendAiStatus).toHaveBeenCalledWith({
      status: 'thinking',
      actionFile: 'thinking',
      message: 'Thinking',
    });
  });
});
