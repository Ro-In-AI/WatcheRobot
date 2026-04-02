import base64 from 'react-native-base64';
import {BluetoothService} from '../../src/modules/bluetooth/services/bluetoothService';

describe('BluetoothService protocol request flow', () => {
  const createService = () => {
    const manager = {
      state: jest.fn(),
      onStateChange: jest.fn(),
      startDeviceScan: jest.fn(),
      stopDeviceScan: jest.fn(),
      devices: jest.fn(),
      isDeviceConnected: jest.fn(),
    };

    const service = new BluetoothService(manager as never);

    return {service, manager};
  };

  it('returns the write response payload when the characteristic already contains a value', async () => {
    const {service} = createService();
    const device = {
      id: 'device-1',
      writeCharacteristicWithResponseForService: jest.fn().mockResolvedValue({
        value: base64.encode(
          JSON.stringify({
            type: 'sys.ack',
            code: 0,
            data: {type: 'cfg.wifi.set', command_id: 'wifi-1'},
          }),
        ),
      }),
      readCharacteristicForService: jest.fn(),
    };

    (service as any).connectedDevice = device;

    const response = await service.sendRequest(
      {serviceUUID: '00FF', characteristicUUID: 'FF01'},
      '{"type":"cfg.wifi.set","data":{"ssid":"A","password":"B"}}',
    );

    expect(response).toContain('"sys.ack"');
    expect(device.readCharacteristicForService).not.toHaveBeenCalled();
  });

  it('falls back to read when the write response has no value', async () => {
    const {service} = createService();
    const device = {
      id: 'device-2',
      writeCharacteristicWithResponseForService: jest.fn().mockResolvedValue({
        value: null,
      }),
      readCharacteristicForService: jest.fn().mockResolvedValue({
        value: base64.encode(
          JSON.stringify({
            type: 'evt.wifi.status',
            code: 0,
            data: {status: 'connected', ssid: 'Office', ip: '1.2.3.4'},
          }),
        ),
      }),
    };

    (service as any).connectedDevice = device;

    const response = await service.sendRequest(
      {serviceUUID: '00FF', characteristicUUID: 'FF01'},
      '{"type":"cfg.wifi.get","data":{}}',
    );

    expect(device.readCharacteristicForService).toHaveBeenCalledWith(
      '00FF',
      'FF01',
    );
    expect(response).toContain('"evt.wifi.status"');
  });

  it('decodes notification values before forwarding them', () => {
    const {service} = createService();
    const remove = jest.fn();
    let notifyCallback: ((error: null, characteristic: {value: string}) => void) | undefined;
    const device = {
      id: 'device-3',
      monitorCharacteristicForService: jest
        .fn()
        .mockImplementation((_serviceUUID, _characteristicUUID, callback) => {
          notifyCallback = callback;
          return {remove};
        }),
    };

    (service as any).connectedDevice = device;
    const listener = jest.fn();

    const unsubscribe = service.startNotifications(
      {serviceUUID: '00FF', characteristicUUID: 'FF01'},
      listener,
    );

    notifyCallback?.(null, {
      value: base64.encode('{"type":"sys.pong","code":0,"data":{}}'),
    });

    expect(listener).toHaveBeenCalledWith(
      base64.encode('{"type":"sys.pong","code":0,"data":{}}'),
    );

    unsubscribe();
    expect(remove).toHaveBeenCalled();
  });
});
