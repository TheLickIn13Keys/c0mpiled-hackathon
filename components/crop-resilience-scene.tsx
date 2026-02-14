"use client";

import { OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Mesh } from "three";

type CropStem = {
  color: string;
  height: number;
  x: number;
  z: number;
};

function CropField() {
  const stems = useMemo<CropStem[]>(() => {
    const generated: CropStem[] = [];

    for (let z = -3.8; z <= 3.8; z += 0.52) {
      for (let x = -2.6; x <= 2.6; x += 0.28) {
        const wave = Math.sin(x * 2.4 + z * 1.8);
        const height = 0.42 + ((wave + 1) / 2) * 0.66;
        const vitality = (Math.cos(x * 1.15 - z * 0.8) + 1) / 2;
        const red = Math.round(86 + (1 - vitality) * 72);
        const green = Math.round(124 + vitality * 88);
        generated.push({
          x,
          z,
          height,
          color: `rgb(${red}, ${green}, 78)`
        });
      }
    }

    return generated;
  }, []);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[5.3, 72]} />
        <meshStandardMaterial color="#302316" roughness={0.96} metalness={0.06} />
      </mesh>
      {stems.map((stem, index) => (
        <mesh key={index} position={[stem.x, stem.height / 2, stem.z]} castShadow>
          <boxGeometry args={[0.13, stem.height, 0.86]} />
          <meshStandardMaterial color={stem.color} roughness={0.62} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

function FireRing() {
  const ringRef = useRef<Mesh>(null);

  useFrame(({ clock }, delta) => {
    if (!ringRef.current) {
      return;
    }

    ringRef.current.rotation.z += delta * 0.45;
    const scale = 1 + Math.sin(clock.elapsedTime * 2) * 0.08;
    ringRef.current.scale.set(scale, scale, scale);
  });

  return (
    <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
      <torusGeometry args={[3.2, 0.16, 20, 120]} />
      <meshStandardMaterial
        color="#4eb6ff"
        emissive="#1c8ee9"
        emissiveIntensity={0.85}
        transparent
        opacity={0.48}
      />
    </mesh>
  );
}

function ResilienceShield() {
  const shieldRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!shieldRef.current || Array.isArray(shieldRef.current.material)) {
      return;
    }

    shieldRef.current.rotation.y += 0.003;
    shieldRef.current.material.opacity = 0.11 + Math.sin(clock.elapsedTime * 1.8) * 0.03;
  });

  return (
    <mesh ref={shieldRef} position={[0, 2.2, 0]}>
      <sphereGeometry args={[4.35, 34, 34]} />
      <meshBasicMaterial color="#5fd3ff" wireframe transparent opacity={0.12} />
    </mesh>
  );
}

export default function CropResilienceScene() {
  return (
    <div className="scene-shell">
      <Canvas className="scene-canvas" shadows dpr={[1, 1.8]} camera={{ position: [8, 6, 8], fov: 44 }}>
        <color attach="background" args={["#08101a"]} />
        <fog attach="fog" args={["#08101a", 8, 24]} />
        <ambientLight intensity={0.5} />
        <hemisphereLight args={["#c0f1ab", "#1a2232", 0.78]} />
        <directionalLight
          castShadow
          position={[7, 8.5, 4]}
          intensity={1.18}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[0, 1.4, 0]} intensity={24} distance={10} color="#6cc7ff" />
        <Stars radius={30} depth={18} count={1300} factor={2} fade speed={0.7} />
        <CropField />
        <FireRing />
        <ResilienceShield />
        <OrbitControls
          enablePan={false}
          minDistance={8}
          maxDistance={14}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
      <div className="scene-badges">
        <span>Smoke dose: 42 ug/m3</span>
        <span>PAR blockage: 31%</span>
        <span>Rinse window: 03h 20m</span>
      </div>
    </div>
  );
}
