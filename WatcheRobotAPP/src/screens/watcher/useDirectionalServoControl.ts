import {useCallback, useEffect, useRef} from 'react';
import {SERVO_CONFIG} from '../../modules/bluetooth';

type Axis = 'x' | 'y';

type UseDirectionalServoControlOptions = {
  isConnected: boolean;
  sendServoAngle: (payload: {xDeg?: number; yDeg?: number}) => Promise<unknown>;
};

const SERVO_CONTROL_LOG_PREFIX = '[蓝牙][舵机步进]';

const logServoControl = (message: string, details?: unknown) => {
  if (details !== undefined) {
    console.log(SERVO_CONTROL_LOG_PREFIX, message, details);
    return;
  }

  console.log(SERVO_CONTROL_LOG_PREFIX, message);
};

const warnServoControl = (message: string, details?: unknown) => {
  if (details !== undefined) {
    console.warn(SERVO_CONTROL_LOG_PREFIX, message, details);
    return;
  }

  console.warn(SERVO_CONTROL_LOG_PREFIX, message);
};

const clampAngle = (value: number) =>
  Math.max(SERVO_CONFIG.ANGLE_MIN, Math.min(SERVO_CONFIG.ANGLE_MAX, value));

export const useDirectionalServoControl = ({
  isConnected,
  sendServoAngle,
}: UseDirectionalServoControlOptions) => {
  const angleRef = useRef({
    x: Number(SERVO_CONFIG.AXIS_X_DEFAULT_ANGLE),
    y: Number(SERVO_CONFIG.AXIS_Y_DEFAULT_ANGLE),
  });
  const intervalIdsRef = useRef<Partial<Record<Axis, ReturnType<typeof setInterval>>>>(
    {},
  );

  const stopDirectionalMove = useCallback((axis: Axis) => {
    const timerId = intervalIdsRef.current[axis];
    if (timerId) {
      clearInterval(timerId);
      delete intervalIdsRef.current[axis];
      logServoControl('停止连续步进', {
        axis,
        angle: angleRef.current[axis],
      });
    }
  }, []);

  const sendAxisStep = useCallback(
    async (axis: Axis, delta: number) => {
      if (!isConnected) {
        warnServoControl('设备未连接，忽略舵机步进', {axis, delta});
        return;
      }

      const currentAngle = angleRef.current[axis];
      const nextAngle = clampAngle(currentAngle + delta);

      if (nextAngle === currentAngle) {
        logServoControl('命中角度边界，未发送步进', {
          axis,
          delta,
          currentAngle,
        });
        return;
      }

      angleRef.current[axis] = nextAngle;
      logServoControl('发送单步舵机控制', {
        axis,
        delta,
        previousAngle: currentAngle,
        nextAngle,
      });
      await sendServoAngle(
        axis === 'x' ? {xDeg: nextAngle} : {yDeg: nextAngle},
      );
    },
    [isConnected, sendServoAngle],
  );

  const startDirectionalMove = useCallback(
    async (axis: Axis, delta: number) => {
      logServoControl('开始连续步进', {
        axis,
        delta,
        stepIntervalMs: SERVO_CONFIG.STEP_INTERVAL_MS,
        currentAngle: angleRef.current[axis],
      });
      stopDirectionalMove(axis);
      await sendAxisStep(axis, delta);
      intervalIdsRef.current[axis] = setInterval(() => {
        sendAxisStep(axis, delta).catch(() => undefined);
      }, SERVO_CONFIG.STEP_INTERVAL_MS);
    },
    [sendAxisStep, stopDirectionalMove],
  );

  useEffect(
    () => () => {
      logServoControl('组件卸载，清理舵机步进定时器');
      stopDirectionalMove('x');
      stopDirectionalMove('y');
    },
    [stopDirectionalMove],
  );

  return {
    startDirectionalMove,
    stopDirectionalMove,
  };
};
