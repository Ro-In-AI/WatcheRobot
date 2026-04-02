import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {DancePage} from '../../src/screens/watcher/DancePage';

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
  useBluetooth: () => ({
    status: 'connected',
    sendAiStatus: mockSendAiStatus,
  }),
}));

describe('DancePage', () => {
  beforeEach(() => {
    mockSendAiStatus.mockReset();
  });

  it('sends ai status when an action card is selected', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = ReactTestRenderer.create(<DancePage />);
    });
    const actionCard = renderer!.root.findByProps({testID: 'dance-action-love'});

    await act(async () => {
      actionCard.props.onPress();
    });

    expect(mockSendAiStatus).toHaveBeenCalledWith({
      status: 'love',
      actionFile: 'love',
      message: 'Love',
    });
  });
});
