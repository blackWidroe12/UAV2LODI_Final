'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Float, Line, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Wireframe Drone Component
function WireframeDrone() {
  const droneRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (droneRef.current) {
      droneRef.current.rotation.y = state.clock.elapsedTime * 0.2;
      droneRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.3;
    }
  });

  const droneColor = '#06b6d4'; // Cyber Cyan

  return (
    <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
      <group ref={droneRef} position={[0, 0, 0]} scale={0.8}>
        {/* Main body - central hub */}
        <mesh>
          <boxGeometry args={[1.2, 0.25, 1.2]} />
          <meshBasicMaterial color={droneColor} wireframe />
        </mesh>

        {/* Arms (4 diagonal arms) */}
        {[
          [1, 0, 1],
          [1, 0, -1],
          [-1, 0, 1],
          [-1, 0, -1],
        ].map((pos, i) => (
          <group key={i} position={[pos[0] * 0.8, 0, pos[2] * 0.8]}>
            {/* Arm */}
            <mesh rotation={[0, Math.atan2(pos[2], pos[0]), 0]}>
              <boxGeometry args={[0.8, 0.1, 0.15]} />
              <meshBasicMaterial color={droneColor} wireframe />
            </mesh>

            {/* Motor housing */}
            <mesh position={[pos[0] * 0.4, 0.1, pos[2] * 0.4]}>
              <cylinderGeometry args={[0.15, 0.15, 0.2, 8]} />
              <meshBasicMaterial color={droneColor} wireframe />
            </mesh>

            {/* Propeller */}
            <RotatingPropeller
              position={[pos[0] * 0.4, 0.25, pos[2] * 0.4]}
              speed={i % 2 === 0 ? 1 : -1}
            />
          </group>
        ))}

        {/* Landing gear */}
        {[
          [0.5, -0.3, 0.5],
          [0.5, -0.3, -0.5],
          [-0.5, -0.3, 0.5],
          [-0.5, -0.3, -0.5],
        ].map((pos, i) => (
          <mesh key={`leg-${i}`} position={pos as [number, number, number]}>
            <cylinderGeometry args={[0.03, 0.03, 0.3, 6]} />
            <meshBasicMaterial color={droneColor} wireframe />
          </mesh>
        ))}

        {/* Camera/Gimbal */}
        <group position={[0, -0.3, 0]}>
          <mesh>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshBasicMaterial color={droneColor} wireframe />
          </mesh>
          {/* Camera lens glow */}
          <mesh position={[0, 0, 0.15]}>
            <circleGeometry args={[0.08, 16]} />
            <meshBasicMaterial color="#8c52ff" transparent opacity={0.8} />
          </mesh>
        </group>

        {/* Status lights */}
        <pointLight position={[0, 0.3, 0]} color="#06b6d4" intensity={2} distance={3} />
      </group>
    </Float>
  );
}

// Rotating Propeller Component
function RotatingPropeller({
  position,
  speed,
}: {
  position: [number, number, number];
  speed: number;
}) {
  const propRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (propRef.current) {
      propRef.current.rotation.y = state.clock.elapsedTime * 15 * speed;
    }
  });

  return (
    <mesh ref={propRef} position={position}>
      <torusGeometry args={[0.25, 0.02, 8, 32]} />
      <meshBasicMaterial color="#06b6d4" wireframe />
    </mesh>
  );
}

// Point Cloud Background
function PointCloud() {
  const pointsRef = useRef<THREE.Points>(null);

  const particles = useMemo(() => {
    const positions = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 4 + Math.random() * 6;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) - 2;
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
  }, []);

  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.02;
    }
  });

  return (
    <Points ref={pointsRef} positions={particles} stride={3}>
      <PointMaterial
        transparent
        color="#06b6d4"
        size={0.02}
        sizeAttenuation
        depthWrite={false}
        opacity={0.6}
      />
    </Points>
  );
}

// Ground Grid
function GroundGrid() {
  const gridRef = useRef<THREE.GridHelper>(null);

  return (
    <group position={[0, -3, 0]}>
      <gridHelper
        ref={gridRef}
        args={[20, 40, '#06b6d4', '#1e3a5f']}
        rotation={[0, 0, 0]}
      />
      {/* Horizon glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial
          color="#020617"
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  );
}

// Scanning Line Effect
function ScanLine() {
  const lineRef = useRef<any>(null);

  useFrame((state) => {
    if (lineRef.current) {
      const y = Math.sin(state.clock.elapsedTime * 0.5) * 3;
      lineRef.current.position.y = y;
    }
  });

  return (
    <Line
      ref={lineRef}
      points={[
        [-10, 0, 0],
        [10, 0, 0],
      ]}
      color="#8c52ff"
      lineWidth={1}
      transparent
      opacity={0.3}
    />
  );
}

// Main Scene Component
export function DroneScene() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5">
      <Canvas
        camera={{ position: [4, 2, 4], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.1} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />

        <WireframeDrone />
        <PointCloud />
        <GroundGrid />
        <ScanLine />

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.3}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2}
        />

        {/* Fog effect */}
        <fog attach="fog" args={['#020617', 5, 25]} />
      </Canvas>

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none" />
    </div>
  );
}
