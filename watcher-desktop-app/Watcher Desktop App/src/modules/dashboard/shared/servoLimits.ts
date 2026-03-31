import type { ServoPosition } from "@/modules/dashboard/shared/types";

export const SERVO_LIMITS = {
  xDeg: {
    min: 0,
    max: 180,
  },
  yDeg: {
    min: 90,
    max: 150,
  },
} as const;

export const DEFAULT_SERVO_POSITION: ServoPosition = {
  xDeg: 90,
  yDeg: 90,
};

export function clampServoAxis(axis: "xDeg" | "yDeg", value: number) {
  const { min, max } = SERVO_LIMITS[axis];
  return Math.max(min, Math.min(max, value));
}

export function clampServoPosition(position: ServoPosition): ServoPosition {
  return {
    xDeg: clampServoAxis("xDeg", position.xDeg),
    yDeg: clampServoAxis("yDeg", position.yDeg),
  };
}
