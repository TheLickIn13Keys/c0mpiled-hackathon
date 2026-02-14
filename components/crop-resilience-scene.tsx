"use client";

import { OrbitControls, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { BufferAttribute, Mesh, MeshStandardMaterial, Points } from "three";

type LeafNode = {
  pos: [number, number, number];
  scale: [number, number, number];
};

type EmberSpec = {
  baseY: number;
  drift: number;
  phase: number;
  speed: number;
  swirl: number;
};

function seededNoise(index: number, salt: number) {
  const seed = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453123;
  return seed - Math.floor(seed);
}

const LEAF_NODES: LeafNode[] = [
  { pos: [-0.55, 2.3, -0.2], scale: [0.65, 0.4, 0.5] },
  { pos: [-0.18, 2.78, 0.2], scale: [0.72, 0.46, 0.58] },
  { pos: [0.18, 2.86, -0.1], scale: [0.78, 0.48, 0.62] },
  { pos: [0.53, 2.36, 0.16], scale: [0.68, 0.44, 0.54] },
  { pos: [-0.27, 2.12, 0.44], scale: [0.54, 0.36, 0.4] },
  { pos: [0.38, 2.02, -0.42], scale: [0.54, 0.34, 0.42] }
];

function AlmondPlant({ ignitionNodes }: { ignitionNodes: number }) {
  const hotLeafMaterials = useRef<Array<MeshStandardMaterial | null>>([]);
  const emberCatchRefs = useRef<Array<Mesh | null>>([]);
  const hotLeafIndexes = useMemo(
    () =>
      new Set(
        Array.from({ length: Math.min(ignitionNodes, LEAF_NODES.length) }, (_, index) => index)
      ),
    [ignitionNodes]
  );

  useFrame(({ clock }) => {
    const pulse = (Math.sin(clock.elapsedTime * 8) + 1) / 2;

    for (let index = 0; index < hotLeafMaterials.current.length; index += 1) {
      const material = hotLeafMaterials.current[index];
      if (!material) {
        continue;
      }

      const isHot = hotLeafIndexes.has(index);
      material.emissiveIntensity = isHot ? 0.25 + pulse * 0.75 : 0;
    }

    for (let index = 0; index < emberCatchRefs.current.length; index += 1) {
      const ember = emberCatchRefs.current[index];
      if (!ember) {
        continue;
      }

      const isActive = index < ignitionNodes;
      const energy =
        (isActive ? 0.82 : 0.5) +
        Math.sin(clock.elapsedTime * (isActive ? 12 : 7) + index * 1.4) *
          (isActive ? 0.28 : 0.14);
      ember.scale.setScalar(energy);
    }
  });

  return (
    <group position={[0, 0.15, 0]}>
      <mesh position={[0, 1.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.31, 2.8, 14]} />
        <meshStandardMaterial color="#68462d" roughness={0.86} />
      </mesh>

      <mesh position={[-0.42, 2.05, 0.08]} rotation={[0.3, 0.25, 1]} castShadow>
        <cylinderGeometry args={[0.05, 0.09, 1.15, 10]} />
        <meshStandardMaterial color="#6a4b30" roughness={0.82} />
      </mesh>

      <mesh position={[0.44, 2.18, -0.06]} rotation={[-0.2, -0.28, -1.12]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, 1.32, 10]} />
        <meshStandardMaterial color="#6a4b30" roughness={0.82} />
      </mesh>

      {LEAF_NODES.map((node, index) => (
        <mesh
          key={`leaf-${index}`}
          position={node.pos}
          scale={node.scale}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[0.64, 18, 18]} />
          <meshStandardMaterial
            ref={(material) => {
              hotLeafMaterials.current[index] = material;
            }}
            color={hotLeafIndexes.has(index) ? "#81964d" : "#678943"}
            emissive={hotLeafIndexes.has(index) ? "#ff5a1f" : "#000000"}
            emissiveIntensity={hotLeafIndexes.has(index) ? 0.35 : 0}
            roughness={0.74}
          />
        </mesh>
      ))}

      {[
        [-0.06, 2.86, 0.28],
        [0.24, 2.54, -0.03],
        [-0.24, 2.22, 0.32],
        [0.16, 2.12, -0.24]
      ].map((pos, index) => (
        <mesh
          key={`ember-catch-${index}`}
          ref={(mesh) => {
            emberCatchRefs.current[index] = mesh;
          }}
          position={pos as [number, number, number]}
        >
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshStandardMaterial
            color={index < ignitionNodes ? "#ff9442" : "#b9a18f"}
            emissive="#ff5a1f"
            emissiveIntensity={index < ignitionNodes ? 1.35 : 0}
            roughness={0.18}
          />
        </mesh>
      ))}

      {[
        [-0.16, 2.64, 0.05],
        [0.21, 2.32, 0.18],
        [0.05, 2.08, -0.2]
      ].map((pos, index) => (
        <mesh key={`almond-${index}`} position={pos as [number, number, number]} castShadow>
          <sphereGeometry args={[0.08, 10, 10]} />
          <meshStandardMaterial color="#c29463" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function EmberStream({ particleCount }: { particleCount: number }) {
  const specs = useMemo<EmberSpec[]>(
    () =>
      Array.from({ length: particleCount }, (_, index) => ({
        baseY: 1 + seededNoise(index, 1) * 2.3,
        drift: (seededNoise(index, 2) - 0.5) * 1.8,
        phase: seededNoise(index, 3) * Math.PI * 2,
        speed: 0.24 + seededNoise(index, 4) * 0.5,
        swirl: 0.14 + seededNoise(index, 5) * 0.28 + index * 0.0004
      })),
    [particleCount]
  );
  const initialPositions = useMemo(() => new Float32Array(particleCount * 3), [particleCount]);
  const pointsRef = useRef<Points>(null);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    const geometry = pointsRef.current?.geometry;
    if (!geometry) {
      return;
    }

    const attribute = geometry.attributes.position as BufferAttribute;
    const positions = attribute.array as Float32Array;

    for (let index = 0; index < specs.length; index += 1) {
      const spec = specs[index];
      const progress = (time * spec.speed + index * 0.053) % 1;
      const pointer = index * 3;
      const x = -3.2 + progress * 6.6;
      const nearCanopy = x > -0.42 && x < 0.62;

      positions[pointer] = x + Math.sin(time * 2 + spec.phase) * spec.swirl;
      positions[pointer + 1] =
        spec.baseY +
        Math.sin(time * 4 + spec.phase) * 0.2 +
        (nearCanopy ? 0.18 + Math.sin(time * 10 + index) * 0.08 : 0);
      positions[pointer + 2] =
        spec.drift + Math.cos(time * 2.2 + spec.phase) * (nearCanopy ? 0.1 : 0.22);
    }

    attribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[initialPositions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#ff9a42"
        size={0.07}
        sizeAttenuation
        transparent
        opacity={0.94}
        depthWrite={false}
      />
    </points>
  );
}

type CropResilienceSceneProps = {
  emberRatePerMinute?: number;
  ignitionNodes?: number;
  rinseWindowMinutes?: number;
};

export default function CropResilienceScene({
  emberRatePerMinute = 120,
  ignitionNodes = 3,
  rinseWindowMinutes = 130
}: CropResilienceSceneProps) {
  const particleCount = Math.max(90, Math.min(280, Math.round(emberRatePerMinute * 1.7)));
  const activeIgnitionNodes = Math.max(1, Math.min(6, ignitionNodes));
  const rinseHours = Math.floor(rinseWindowMinutes / 60)
    .toString()
    .padStart(2, "0");
  const rinseMins = Math.floor(rinseWindowMinutes % 60)
    .toString()
    .padStart(2, "0");

  return (
    <div className="scene-shell">
      <Canvas className="scene-canvas" shadows dpr={[1, 1.8]} camera={{ position: [8, 6, 8], fov: 44 }}>
        <color attach="background" args={["#130d09"]} />
        <fog attach="fog" args={["#130d09", 7, 19]} />
        <ambientLight intensity={0.34} />
        <hemisphereLight args={["#d7f7c4", "#2c2117", 0.72]} />
        <directionalLight
          castShadow
          position={[6.8, 8, 3.2]}
          intensity={1.05}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[0.18, 2.32, 0.05]} intensity={20} distance={5.5} color="#ff6b2f" />
        <pointLight position={[-0.32, 2.68, 0.2]} intensity={9} distance={3.8} color="#ff8f47" />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[4.9, 64]} />
          <meshStandardMaterial color="#2f2419" roughness={0.95} metalness={0.04} />
        </mesh>
        <Sparkles
          count={Math.max(40, Math.min(120, Math.round(particleCount * 0.4)))}
          scale={[5.8, 2.8, 4]}
          position={[0.1, 2.2, 0]}
          size={2}
          speed={0.25}
          color="#a3a7b3"
          opacity={0.35}
        />
        <AlmondPlant ignitionNodes={activeIgnitionNodes} />
        <EmberStream particleCount={particleCount} />
        <OrbitControls
          enablePan={false}
          minDistance={6}
          maxDistance={11}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
      <div className="scene-badges">
        <span>Ember stream: {Math.round(emberRatePerMinute)} sparks/min</span>
        <span>Ignition nodes: {activeIgnitionNodes} active leaves</span>
        <span>
          Recommended rinse: {rinseHours}h {rinseMins}m
        </span>
      </div>
    </div>
  );
}
