export const BLE_PROTOCOL_TYPES = {
  servoAngle: 'ctrl.servo.angle',
  aiStatus: 'evt.ai.status',
  robotStateSet: 'ctrl.robot.state.set',
  wifiSet: 'cfg.wifi.set',
  wifiGet: 'cfg.wifi.get',
  wifiClear: 'cfg.wifi.clear',
  ping: 'sys.ping',
  pong: 'sys.pong',
  ack: 'sys.ack',
  nack: 'sys.nack',
  wifiStatus: 'evt.wifi.status',
} as const;

export type BleProtocolRequestType =
  | typeof BLE_PROTOCOL_TYPES.servoAngle
  | typeof BLE_PROTOCOL_TYPES.aiStatus
  | typeof BLE_PROTOCOL_TYPES.robotStateSet
  | typeof BLE_PROTOCOL_TYPES.wifiSet
  | typeof BLE_PROTOCOL_TYPES.wifiGet
  | typeof BLE_PROTOCOL_TYPES.wifiClear
  | typeof BLE_PROTOCOL_TYPES.ping;

export type BleProtocolResponseType =
  | typeof BLE_PROTOCOL_TYPES.pong
  | typeof BLE_PROTOCOL_TYPES.ack
  | typeof BLE_PROTOCOL_TYPES.nack
  | typeof BLE_PROTOCOL_TYPES.wifiStatus;

export type BleWifiConnectionState =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'unconfigured';

type BleProtocolEnvelope<TType extends string, TData extends object> = {
  type: TType;
  data: TData;
  code?: number;
};

export type BleServoAngleCommandData = {
  x_deg?: number;
  y_deg?: number;
  duration_ms?: number;
  command_id?: string;
};

export type BleAiStatusCommandData = {
  status?: string;
  message?: string;
  image_name?: string;
  action_file?: string;
  sound_file?: string;
  command_id?: string;
};

export type BleRobotStateSetCommandData = {
  state_id: string;
  command_id?: string;
};

export type BleWifiConfigCommandData = {
  ssid: string;
  password: string;
  command_id?: string;
};

export type BleWifiCommandData = {
  command_id?: string;
};

export type BleAckMessage = BleProtocolEnvelope<
  typeof BLE_PROTOCOL_TYPES.ack,
  {
    type: BleProtocolRequestType;
    command_id?: string;
  }
> & { code: 0 };

export type BleNackMessage = BleProtocolEnvelope<
  typeof BLE_PROTOCOL_TYPES.nack,
  {
    type: string;
    command_id?: string;
    reason: string;
  }
> & { code: number };

export type BlePongMessage = BleProtocolEnvelope<
  typeof BLE_PROTOCOL_TYPES.pong,
  Record<string, never>
> & { code: 0 };

export type BleWifiStatusMessage = BleProtocolEnvelope<
  typeof BLE_PROTOCOL_TYPES.wifiStatus,
  {
    status: BleWifiConnectionState;
    ssid?: string;
    ip?: string;
  }
> & { code: number };

export type BleServoAngleCommand = BleProtocolEnvelope<
  typeof BLE_PROTOCOL_TYPES.servoAngle,
  BleServoAngleCommandData
>;

export type BleAiStatusCommand = BleProtocolEnvelope<
  typeof BLE_PROTOCOL_TYPES.aiStatus,
  BleAiStatusCommandData
>;

export type BleRobotStateSetCommand = BleProtocolEnvelope<
  typeof BLE_PROTOCOL_TYPES.robotStateSet,
  BleRobotStateSetCommandData
>;

export type BleWifiSetCommand = BleProtocolEnvelope<
  typeof BLE_PROTOCOL_TYPES.wifiSet,
  BleWifiConfigCommandData
>;

export type BleWifiGetCommand = BleProtocolEnvelope<
  typeof BLE_PROTOCOL_TYPES.wifiGet,
  BleWifiCommandData
>;

export type BleWifiClearCommand = BleProtocolEnvelope<
  typeof BLE_PROTOCOL_TYPES.wifiClear,
  BleWifiCommandData
>;

export type BlePingCommand = BleProtocolEnvelope<
  typeof BLE_PROTOCOL_TYPES.ping,
  Record<string, never>
>;

export type BleProtocolRequestMessage =
  | BleServoAngleCommand
  | BleAiStatusCommand
  | BleRobotStateSetCommand
  | BleWifiSetCommand
  | BleWifiGetCommand
  | BleWifiClearCommand
  | BlePingCommand;

export type BleProtocolMessage =
  | BleProtocolRequestMessage
  | BleAckMessage
  | BleNackMessage
  | BlePongMessage
  | BleWifiStatusMessage;

let commandCounter = 0;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIntegerInRange = (value: unknown, min: number, max: number) =>
  Number.isInteger(value) && Number(value) >= min && Number(value) <= max;

const isOptionalString = (value: unknown) =>
  value === undefined || typeof value === 'string';

export const createBleCommandId = (prefix: string = 'cmd') => {
  commandCounter += 1;
  return `${prefix}-${commandCounter.toString().padStart(4, '0')}`;
};

const normalizeCommandId = (commandId: string | undefined, prefix: string) =>
  commandId && commandId.trim().length > 0
    ? commandId.trim()
    : createBleCommandId(prefix);

const validateOptionalCommandId = (commandId: unknown, fieldName: string) => {
  if (!isOptionalString(commandId)) {
    throw new Error(`${fieldName} must be a string when provided`);
  }
};

export const buildServoAngleCommand = (
  data: BleServoAngleCommandData,
): BleServoAngleCommand => {
  const hasX = typeof data.x_deg === 'number';
  const hasY = typeof data.y_deg === 'number';

  if (hasX === hasY) {
    throw new Error('ctrl.servo.angle requires exactly one of x_deg or y_deg');
  }

  if (hasX && !isIntegerInRange(data.x_deg, 0, 180)) {
    throw new Error('x_deg must be an integer in the range 0..180');
  }

  if (hasY && !isIntegerInRange(data.y_deg, 0, 180)) {
    throw new Error('y_deg must be an integer in the range 0..180');
  }

  if (
    data.duration_ms !== undefined &&
    !isIntegerInRange(data.duration_ms, 0, 5000)
  ) {
    throw new Error('duration_ms must be an integer in the range 0..5000');
  }

  validateOptionalCommandId(data.command_id, 'command_id');

  return {
    type: BLE_PROTOCOL_TYPES.servoAngle,
    data: {
      ...(hasX ? {x_deg: data.x_deg} : {}),
      ...(hasY ? {y_deg: data.y_deg} : {}),
      ...(data.duration_ms !== undefined
        ? {duration_ms: data.duration_ms}
        : {}),
      command_id: normalizeCommandId(data.command_id, 'servo'),
    },
  };
};

export const buildAiStatusCommand = (
  data: BleAiStatusCommandData,
): BleAiStatusCommand => {
  validateOptionalCommandId(data.command_id, 'command_id');

  const hasMeaningfulField = [
    data.status,
    data.message,
    data.image_name,
    data.action_file,
    data.sound_file,
  ].some(value => typeof value === 'string' && value.trim().length > 0);

  if (!hasMeaningfulField) {
    throw new Error(
      'evt.ai.status requires at least one meaningful status payload field',
    );
  }

  if (
    ![
      data.status,
      data.message,
      data.image_name,
      data.action_file,
      data.sound_file,
    ].every(isOptionalString)
  ) {
    throw new Error('evt.ai.status fields must be strings when provided');
  }

  return {
    type: BLE_PROTOCOL_TYPES.aiStatus,
    data: {
      ...(data.status ? {status: data.status} : {}),
      ...(data.message ? {message: data.message} : {}),
      ...(data.image_name ? {image_name: data.image_name} : {}),
      ...(data.action_file ? {action_file: data.action_file} : {}),
      ...(data.sound_file ? {sound_file: data.sound_file} : {}),
      command_id: normalizeCommandId(data.command_id, 'ai'),
    },
  };
};

export const buildRobotStateSetCommand = (
  data: BleRobotStateSetCommandData,
): BleRobotStateSetCommand => {
  if (!data.state_id || data.state_id.trim().length === 0) {
    throw new Error('ctrl.robot.state.set requires a non-empty state_id');
  }

  validateOptionalCommandId(data.command_id, 'command_id');

  return {
    type: BLE_PROTOCOL_TYPES.robotStateSet,
    data: {
      state_id: data.state_id.trim(),
      command_id: normalizeCommandId(data.command_id, 'state'),
    },
  };
};

export const buildWifiSetCommand = (
  data: BleWifiConfigCommandData,
): BleWifiSetCommand => {
  if (!data.ssid || data.ssid.trim().length === 0) {
    throw new Error('cfg.wifi.set requires a non-empty ssid');
  }

  if (typeof data.password !== 'string') {
    throw new Error('cfg.wifi.set requires password to be a string');
  }

  validateOptionalCommandId(data.command_id, 'command_id');

  return {
    type: BLE_PROTOCOL_TYPES.wifiSet,
    data: {
      ssid: data.ssid,
      password: data.password,
      command_id: normalizeCommandId(data.command_id, 'wifi-set'),
    },
  };
};

export const buildWifiGetCommand = (
  commandId?: string,
): BleWifiGetCommand => {
  validateOptionalCommandId(commandId, 'command_id');

  return {
    type: BLE_PROTOCOL_TYPES.wifiGet,
    data: {
      command_id: normalizeCommandId(commandId, 'wifi-get'),
    },
  };
};

export const buildWifiClearCommand = (
  commandId?: string,
): BleWifiClearCommand => {
  validateOptionalCommandId(commandId, 'command_id');

  return {
    type: BLE_PROTOCOL_TYPES.wifiClear,
    data: {
      command_id: normalizeCommandId(commandId, 'wifi-clear'),
    },
  };
};

export const buildPingCommand = (): BlePingCommand => ({
  type: BLE_PROTOCOL_TYPES.ping,
  data: {},
});

export const encodeBleProtocolMessage = (message: BleProtocolMessage) =>
  JSON.stringify(message);

const ensureEnvelope = (value: unknown): {type: string; data: Record<string, unknown>; code?: unknown} => {
  if (!isObjectRecord(value)) {
    throw new Error('BLE protocol message must be a JSON object');
  }

  if (typeof value.type !== 'string' || value.type.trim().length === 0) {
    throw new Error('BLE protocol message must include a type string');
  }

  if (!isObjectRecord(value.data)) {
    throw new Error('BLE protocol message must include an object data field');
  }

  return {
    type: value.type,
    data: value.data,
    ...(Object.prototype.hasOwnProperty.call(value, 'code')
      ? {code: value.code}
      : {}),
  };
};

const ensureAckMessage = (value: ReturnType<typeof ensureEnvelope>): BleAckMessage => {
  if (value.code !== 0) {
    throw new Error('sys.ack code must be 0');
  }

  if (typeof value.data.type !== 'string') {
    throw new Error('sys.ack data.type must be a string');
  }

  validateOptionalCommandId(value.data.command_id, 'sys.ack data.command_id');

  return {
    type: BLE_PROTOCOL_TYPES.ack,
    code: 0,
    data: {
      type: value.data.type as BleProtocolRequestType,
      ...(value.data.command_id
        ? {command_id: value.data.command_id as string}
        : {}),
    },
  };
};

const ensureNackMessage = (
  value: ReturnType<typeof ensureEnvelope>,
): BleNackMessage => {
  if (typeof value.code !== 'number') {
    throw new Error('sys.nack code must be a number');
  }

  if (typeof value.data.type !== 'string') {
    throw new Error('sys.nack data.type must be a string');
  }

  if (typeof value.data.reason !== 'string' || value.data.reason.length === 0) {
    throw new Error('sys.nack data.reason must be a non-empty string');
  }

  validateOptionalCommandId(value.data.command_id, 'sys.nack data.command_id');

  return {
    type: BLE_PROTOCOL_TYPES.nack,
    code: value.code,
    data: {
      type: value.data.type,
      reason: value.data.reason,
      ...(value.data.command_id
        ? {command_id: value.data.command_id as string}
        : {}),
    },
  };
};

const ensurePongMessage = (
  value: ReturnType<typeof ensureEnvelope>,
): BlePongMessage => {
  if (value.code !== 0) {
    throw new Error('sys.pong code must be 0');
  }

  return {
    type: BLE_PROTOCOL_TYPES.pong,
    code: 0,
    data: {},
  };
};

const ensureWifiStatusMessage = (
  value: ReturnType<typeof ensureEnvelope>,
): BleWifiStatusMessage => {
  if (typeof value.code !== 'number') {
    throw new Error('evt.wifi.status code must be a number');
  }

  const {status, ssid, ip} = value.data;
  const validStatuses: BleWifiConnectionState[] = [
    'connected',
    'connecting',
    'disconnected',
    'unconfigured',
  ];

  if (typeof status !== 'string' || !validStatuses.includes(status as BleWifiConnectionState)) {
    throw new Error('evt.wifi.status data.status is invalid');
  }

  if (!isOptionalString(ssid) || !isOptionalString(ip)) {
    throw new Error('evt.wifi.status ssid/ip must be strings when provided');
  }

  return {
    type: BLE_PROTOCOL_TYPES.wifiStatus,
    code: value.code,
    data: {
      status: status as BleWifiConnectionState,
      ...(typeof ssid === 'string' ? {ssid} : {}),
      ...(typeof ip === 'string' ? {ip} : {}),
    },
  };
};

export const parseBleProtocolMessage = (raw: string): BleProtocolMessage => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Failed to parse BLE protocol JSON');
  }

  const envelope = ensureEnvelope(parsed);

  switch (envelope.type) {
    case BLE_PROTOCOL_TYPES.ack:
      return ensureAckMessage(envelope);
    case BLE_PROTOCOL_TYPES.nack:
      return ensureNackMessage(envelope);
    case BLE_PROTOCOL_TYPES.pong:
      return ensurePongMessage(envelope);
    case BLE_PROTOCOL_TYPES.wifiStatus:
      return ensureWifiStatusMessage(envelope);
    case BLE_PROTOCOL_TYPES.servoAngle:
      return buildServoAngleCommand(envelope.data as BleServoAngleCommandData);
    case BLE_PROTOCOL_TYPES.aiStatus:
      return buildAiStatusCommand(envelope.data as BleAiStatusCommandData);
    case BLE_PROTOCOL_TYPES.robotStateSet:
      return buildRobotStateSetCommand(
        envelope.data as BleRobotStateSetCommandData,
      );
    case BLE_PROTOCOL_TYPES.wifiSet:
      return buildWifiSetCommand(envelope.data as BleWifiConfigCommandData);
    case BLE_PROTOCOL_TYPES.wifiGet:
      return buildWifiGetCommand(envelope.data.command_id as string | undefined);
    case BLE_PROTOCOL_TYPES.wifiClear:
      return buildWifiClearCommand(
        envelope.data.command_id as string | undefined,
      );
    case BLE_PROTOCOL_TYPES.ping:
      return buildPingCommand();
    default:
      throw new Error(`Unsupported BLE protocol message type: ${envelope.type}`);
  }
};

export const tryParseBleProtocolMessage = (raw: string) => {
  try {
    return parseBleProtocolMessage(raw);
  } catch {
    return null;
  }
};

export const isAckMessage = (
  message: BleProtocolMessage,
): message is BleAckMessage => message.type === BLE_PROTOCOL_TYPES.ack;

export const isNackMessage = (
  message: BleProtocolMessage,
): message is BleNackMessage => message.type === BLE_PROTOCOL_TYPES.nack;

export const isPongMessage = (
  message: BleProtocolMessage,
): message is BlePongMessage => message.type === BLE_PROTOCOL_TYPES.pong;

export const isWifiStatusMessage = (
  message: BleProtocolMessage,
): message is BleWifiStatusMessage => message.type === BLE_PROTOCOL_TYPES.wifiStatus;

export class BleProtocolNackError extends Error {
  code: number;

  reason: string;

  commandType: string;

  commandId?: string;

  constructor(message: BleNackMessage) {
    super(
      `${message.data.type} failed with ${message.data.reason} (${message.code})`,
    );
    this.name = 'BleProtocolNackError';
    this.code = message.code;
    this.reason = message.data.reason;
    this.commandType = message.data.type;
    this.commandId = message.data.command_id;
  }
}

export const assertAckForCommand = (
  message: BleProtocolMessage,
  expectedType: BleProtocolRequestType,
): BleAckMessage => {
  if (!isAckMessage(message)) {
    throw new Error(`Expected sys.ack for ${expectedType}`);
  }

  if (message.data.type !== expectedType) {
    throw new Error(
      `Expected sys.ack for ${expectedType}, received ${message.data.type}`,
    );
  }

  return message;
};

export const assertPongMessage = (message: BleProtocolMessage) => {
  if (!isPongMessage(message)) {
    throw new Error('Expected sys.pong response');
  }

  return message;
};
