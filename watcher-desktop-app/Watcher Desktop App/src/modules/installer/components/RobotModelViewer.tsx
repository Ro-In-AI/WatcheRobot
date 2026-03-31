import { Suspense, useMemo } from "react";
import { ContactShadows, Html, OrbitControls, useProgress } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const BASE_LINK_MODEL_URL = new URL(
  "../../../../watcher v1.SLDASM/meshes/base_link.STL",
  import.meta.url,
).href;
const LINK_1_MODEL_URL = new URL(
  "../../../../watcher v1.SLDASM/meshes/link1.STL",
  import.meta.url,
).href;
const LINK_2_MODEL_URL = new URL(
  "../../../../watcher v1.SLDASM/meshes/link2.STL",
  import.meta.url,
).href;
const ROBOT_MODEL_URLS = [BASE_LINK_MODEL_URL, LINK_1_MODEL_URL, LINK_2_MODEL_URL];

const ROOT_ROTATION: [number, number, number] = [0, 0, Math.PI];
const ORBIT_TARGET: [number, number, number] = [0, 1.2, 0];
const CAMERA_PRESETS = {
  default: {
    position: [0, 1.58, -6.4] as [number, number, number],
    fov: 27,
    minDistance: 5.2,
    maxDistance: 9.6,
  },
  dashboard: {
    position: [0, 1.52, -6.0] as [number, number, number],
    fov: 26,
    minDistance: 4.8,
    maxDistance: 8.8,
  },
} as const;

const JOINT_1_ORIGIN: [number, number, number] = [
  -0.0209999999996985,
  0,
  -0.0217499999996899,
];
const JOINT_1_RPY: [number, number, number] = [
  1.5707963267949,
  0.0367776961816941,
  0,
];
const JOINT_1_AXIS = new THREE.Vector3(0, 0, 1).normalize();

const JOINT_2_ORIGIN: [number, number, number] = [0, 0, -0.00775458892831293];
const JOINT_2_RPY: [number, number, number] = [
  -0.0663868244272319,
  1.64661701168685e-5,
  -3.34691104104904e-5,
];
const JOINT_2_AXIS = new THREE.Vector3(
  -0.999999999304342,
  -3.23030508072447e-5,
  -1.86501747391106e-5,
).normalize();
const SERVO_NEUTRAL_DEG = 90;

function LoadingState() {
  const { progress } = useProgress();

  return (
    <Html center>
      <div className="robot-viewer__loading">模型加载中 {Math.round(progress)}%</div>
    </Html>
  );
}

interface RobotMeshProps {
  xDeg?: number;
  yDeg?: number;
}

function createTransformMatrix(
  position: [number, number, number],
  rotation: [number, number, number],
) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation, "XYZ")),
    new THREE.Vector3(1, 1, 1),
  );
}

function prepareGeometry(geometry: THREE.BufferGeometry) {
  const preparedGeometry = geometry.clone();
  preparedGeometry.computeVertexNormals();
  preparedGeometry.computeBoundingBox();
  return preparedGeometry;
}

function createAssemblyMetrics(geometries: readonly THREE.BufferGeometry[]) {
  const [baseLinkGeometry, link1Geometry, link2Geometry] = geometries;
  const joint1Matrix = createTransformMatrix(JOINT_1_ORIGIN, JOINT_1_RPY);
  const joint2Matrix = createTransformMatrix(JOINT_2_ORIGIN, JOINT_2_RPY);
  const link2Matrix = joint1Matrix.clone().multiply(joint2Matrix);
  const rootMatrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(...ROOT_ROTATION, "XYZ"),
  );
  const sceneBounds = new THREE.Box3();
  const baseLinkBounds = new THREE.Box3();

  const meshEntries: Array<[THREE.BufferGeometry, THREE.Matrix4 | null]> = [
    [baseLinkGeometry, rootMatrix],
    [link1Geometry, rootMatrix.clone().multiply(joint1Matrix)],
    [link2Geometry, rootMatrix.clone().multiply(link2Matrix)],
  ];

  meshEntries.forEach(([geometry, matrix]) => {
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }

    const bounds = geometry.boundingBox?.clone();
    if (!bounds) {
      return;
    }

    if (matrix) {
      bounds.applyMatrix4(matrix);
    }

    sceneBounds.union(bounds);
  });

  if (!baseLinkGeometry.boundingBox) {
    baseLinkGeometry.computeBoundingBox();
  }

  if (baseLinkGeometry.boundingBox) {
    baseLinkBounds.copy(baseLinkGeometry.boundingBox).applyMatrix4(rootMatrix);
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  sceneBounds.getCenter(center);
  sceneBounds.getSize(size);

  return {
    center,
    baseLinkMinY: baseLinkBounds.min.y,
    scale: 2.4 / (Math.max(size.x, size.y, size.z) || 1),
  };
}

interface RobotLinkMeshProps {
  geometry: THREE.BufferGeometry;
}

function RobotLinkMesh({ geometry }: RobotLinkMeshProps) {
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#dbe7ff" metalness={0.16} roughness={0.42} />
    </mesh>
  );
}

function RobotMesh({ xDeg = SERVO_NEUTRAL_DEG, yDeg = SERVO_NEUTRAL_DEG }: RobotMeshProps) {
  const rawGeometries = useLoader(STLLoader, ROBOT_MODEL_URLS) as THREE.BufferGeometry[];

  const {
    baseLinkGeometry,
    link1Geometry,
    link2Geometry,
    assemblyCenter,
    baseLinkMinY,
    assemblyScale,
  } = useMemo(() => {
    const preparedGeometries = rawGeometries.map((geometry) => prepareGeometry(geometry));
    const { center, scale, baseLinkMinY } = createAssemblyMetrics(preparedGeometries);

    return {
      baseLinkGeometry: preparedGeometries[0],
      link1Geometry: preparedGeometries[1],
      link2Geometry: preparedGeometries[2],
      assemblyCenter: center,
      baseLinkMinY,
      assemblyScale: scale,
    };
  }, [rawGeometries]);

  const joint1Quaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromAxisAngle(
        JOINT_1_AXIS,
        THREE.MathUtils.degToRad(xDeg - SERVO_NEUTRAL_DEG),
      ),
    [xDeg],
  );
  const joint2Quaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromAxisAngle(
        JOINT_2_AXIS,
        THREE.MathUtils.degToRad(yDeg - SERVO_NEUTRAL_DEG),
      ),
    [yDeg],
  );

  return (
    <group scale={assemblyScale}>
      <group position={[-assemblyCenter.x, -baseLinkMinY, -assemblyCenter.z]}>
        <group rotation={ROOT_ROTATION}>
          <RobotLinkMesh geometry={baseLinkGeometry} />

          <group position={JOINT_1_ORIGIN} rotation={JOINT_1_RPY}>
            <group quaternion={joint1Quaternion}>
              <RobotLinkMesh geometry={link1Geometry} />

              <group position={JOINT_2_ORIGIN} rotation={JOINT_2_RPY}>
                <group quaternion={joint2Quaternion}>
                  <RobotLinkMesh geometry={link2Geometry} />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

interface RobotModelViewerProps {
  xDeg?: number;
  yDeg?: number;
  active?: boolean;
  showHint?: boolean;
  variant?: "default" | "dashboard";
}

export default function RobotModelViewer({
  xDeg = SERVO_NEUTRAL_DEG,
  yDeg = SERVO_NEUTRAL_DEG,
  active = true,
  showHint = true,
  variant = "default",
}: RobotModelViewerProps) {
  const cameraPreset = variant === "dashboard" ? CAMERA_PRESETS.dashboard : CAMERA_PRESETS.default;
  const wrapperClassName = [
    "robot-viewer",
    variant === "dashboard" ? "robot-viewer--dashboard" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClassName}>
      <Canvas
        shadows
        frameloop={active ? "always" : "demand"}
        camera={{ position: cameraPreset.position, fov: cameraPreset.fov }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
      >
        {variant === "default" ? <color attach="background" args={["#edf3fb"]} /> : null}
        {variant === "default" ? <fog attach="fog" args={["#edf3fb", 5, 10]} /> : null}
        <ambientLight intensity={variant === "dashboard" ? 0.95 : 0.8} />
        <hemisphereLight
          args={
            variant === "dashboard"
              ? ["#ffffff", "#f2f2f2", 1.05]
              : ["#f9fbff", "#d6e1f4", 0.85]
          }
        />
        <directionalLight
          castShadow
          position={variant === "dashboard" ? [4.5, 4.4, 3.2] : [4, 5, 3]}
          intensity={variant === "dashboard" ? 1.9 : 1.7}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight
          position={variant === "dashboard" ? [-2.4, 2.4, -0.8] : [-3, 2, -1]}
          intensity={variant === "dashboard" ? 0.42 : 0.55}
          color={variant === "dashboard" ? "#ffffff" : "#cfe1ff"}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={variant === "dashboard" ? [5.8, 5.8] : [6.8, 6.8]} />
          <meshStandardMaterial
            color={variant === "dashboard" ? "#eef1f6" : "#f7fbff"}
            roughness={1}
            metalness={0}
            transparent
            opacity={0.9}
          />
        </mesh>
        <gridHelper
          args={[
            variant === "dashboard" ? 5.8 : 6.8,
            variant === "dashboard" ? 12 : 14,
            variant === "dashboard" ? "#91a3bf" : "#a5b9df",
            variant === "dashboard" ? "#c8d2e2" : "#d5e0f4",
          ]}
          position={[0, 0.001, 0]}
        />
        <Suspense fallback={<LoadingState />}>
          <RobotMesh xDeg={xDeg} yDeg={yDeg} />
        </Suspense>
        <ContactShadows
          position={[0, 0.01, 0]}
          opacity={variant === "dashboard" ? 0.2 : 0.28}
          scale={variant === "dashboard" ? 3.2 : 4.1}
          blur={variant === "dashboard" ? 2.4 : 2.8}
          far={variant === "dashboard" ? 1.55 : 1.8}
        />
        <OrbitControls
          enabled={active}
          enablePan={false}
          target={ORBIT_TARGET}
          minDistance={cameraPreset.minDistance}
          maxDistance={cameraPreset.maxDistance}
          autoRotate={false}
        />
      </Canvas>
      {showHint ? <div className="robot-viewer__hint">拖拽旋转，滚轮缩放</div> : null}
    </div>
  );
}
