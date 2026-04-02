import {
  BLE_PROTOCOL_TYPES,
  BleProtocolNackError,
  assertAckForCommand,
  assertPongMessage,
  buildAiStatusCommand,
  buildPingCommand,
  buildServoAngleCommand,
  buildWifiSetCommand,
  encodeBleProtocolMessage,
  isNackMessage,
  isWifiStatusMessage,
  parseBleProtocolMessage,
  tryParseBleProtocolMessage,
} from '../../src/modules/bluetooth/protocol/bleProtocol';

describe('bleProtocol', () => {
  it('builds a servo angle command with exactly one axis', () => {
    const command = buildServoAngleCommand({
      x_deg: 45,
      duration_ms: 300,
      command_id: 'cmd-001',
    });

    expect(command).toEqual({
      type: BLE_PROTOCOL_TYPES.servoAngle,
      data: {
        x_deg: 45,
        duration_ms: 300,
        command_id: 'cmd-001',
      },
    });
  });

  it('rejects invalid servo payloads', () => {
    expect(() =>
      buildServoAngleCommand({x_deg: 10, y_deg: 20}),
    ).toThrow('exactly one');

    expect(() => buildServoAngleCommand({x_deg: 181})).toThrow('0..180');
    expect(() =>
      buildServoAngleCommand({y_deg: 80, duration_ms: 6000}),
    ).toThrow('0..5000');
  });

  it('builds ai status and wifi set commands', () => {
    expect(
      buildAiStatusCommand({
        status: 'thinking',
        action_file: 'thinking',
        message: 'Thinking...',
        command_id: 'ai-1',
      }),
    ).toEqual({
      type: BLE_PROTOCOL_TYPES.aiStatus,
      data: {
        status: 'thinking',
        action_file: 'thinking',
        message: 'Thinking...',
        command_id: 'ai-1',
      },
    });

    expect(
      buildWifiSetCommand({
        ssid: 'MyWiFi',
        password: '12345678',
        command_id: 'wifi-1',
      }),
    ).toEqual({
      type: BLE_PROTOCOL_TYPES.wifiSet,
      data: {
        ssid: 'MyWiFi',
        password: '12345678',
        command_id: 'wifi-1',
      },
    });
  });

  it('round-trips protocol messages and recognizes wifi status', () => {
    const encoded = encodeBleProtocolMessage(buildPingCommand());
    expect(parseBleProtocolMessage(encoded)).toEqual({
      type: BLE_PROTOCOL_TYPES.ping,
      data: {},
    });

    const wifiStatus = parseBleProtocolMessage(
      JSON.stringify({
        type: BLE_PROTOCOL_TYPES.wifiStatus,
        code: 0,
        data: {
          status: 'connected',
          ssid: 'Office',
          ip: '192.168.1.9',
        },
      }),
    );

    expect(isWifiStatusMessage(wifiStatus)).toBe(true);
    expect(wifiStatus).toEqual({
      type: BLE_PROTOCOL_TYPES.wifiStatus,
      code: 0,
      data: {
        status: 'connected',
        ssid: 'Office',
        ip: '192.168.1.9',
      },
    });
  });

  it('parses ack, nack, and pong responses', () => {
    const ack = parseBleProtocolMessage(
      JSON.stringify({
        type: BLE_PROTOCOL_TYPES.ack,
        code: 0,
        data: {
          type: BLE_PROTOCOL_TYPES.wifiSet,
          command_id: 'wifi-set-001',
        },
      }),
    );
    expect(assertAckForCommand(ack, BLE_PROTOCOL_TYPES.wifiSet)).toEqual(ack);

    const pong = parseBleProtocolMessage(
      JSON.stringify({
        type: BLE_PROTOCOL_TYPES.pong,
        code: 0,
        data: {},
      }),
    );
    expect(assertPongMessage(pong)).toEqual(pong);

    const nack = parseBleProtocolMessage(
      JSON.stringify({
        type: BLE_PROTOCOL_TYPES.nack,
        code: 400,
        data: {
          type: BLE_PROTOCOL_TYPES.servoAngle,
          command_id: 'servo-1',
          reason: 'angle_out_of_range',
        },
      }),
    );

    expect(isNackMessage(nack)).toBe(true);
    expect(() => {
      if (isNackMessage(nack)) {
        throw new BleProtocolNackError(nack);
      }
    }).toThrow('angle_out_of_range');
  });

  it('rejects non-json and unknown message types', () => {
    expect(() => parseBleProtocolMessage('PONG')).toThrow(
      'Failed to parse BLE protocol JSON',
    );
    expect(
      tryParseBleProtocolMessage(
        JSON.stringify({
          type: 'unknown.message',
          data: {},
        }),
      ),
    ).toBeNull();
  });
});
