import {
  BLUETOOTH_UUIDS,
  SERVO_CONFIG,
} from '../constants/bluetoothConstants';
import {
  buildAiStatusCommand,
  buildServoAngleCommand,
  encodeBleProtocolMessage,
} from '../protocol/bleProtocol';

export const sendServoCommand = async (
  writeData: (
    serviceUUID: string,
    charUUID: string,
    data: string,
    withResponse?: boolean,
  ) => Promise<void>,
  servoId: number,
  angle: number,
): Promise<void> => {
  const payload =
    servoId === SERVO_CONFIG.SERVO_X ? {x_deg: angle} : {y_deg: angle};

  await writeData(
    BLUETOOTH_UUIDS.SERVICE_UUID,
    BLUETOOTH_UUIDS.PROTOCOL_IO,
    encodeBleProtocolMessage(buildServoAngleCommand(payload)),
    true,
  );
};

export const sendActionCommand = async (
  writeData: (
    serviceUUID: string,
    charUUID: string,
    data: string,
    withResponse?: boolean,
  ) => Promise<void>,
  actionId: string,
): Promise<void> => {
  await writeData(
    BLUETOOTH_UUIDS.SERVICE_UUID,
    BLUETOOTH_UUIDS.PROTOCOL_IO,
    encodeBleProtocolMessage(
      buildAiStatusCommand({
        status: actionId,
        action_file: actionId,
        message: actionId,
      }),
    ),
    true,
  );
};
