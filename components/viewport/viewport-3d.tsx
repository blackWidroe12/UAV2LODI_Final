'use client';

import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  PerspectiveCamera,
  Grid,
  Environment,
  Stars,
  Html,
} from '@react-three/drei';
import * as THREE from 'three';
import { usePipelineStore } from '@/lib/stores';
import { cn } from '@/lib/utils';

// Point Cloud visualization component
function PointCloud({ pointCount = 10000, spread = 50 }) {
  const pointsRef = useRef<THREE.Points>(null);
  
  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(pointCount * 3);
    const colors = new Float32Array(pointCount * 3);
    
    for (let i = 0; i < pointCount; i++) {
      const i3 = i * 3;
      // Create a terrain-like distribution
      const x = (Math.random() - 0.5) * spread;
      const z = (Math.random() - 0.5) * spread;
      const y = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 3 + Math.random() * 2;
      
      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;
      
      // Color by elevation (cyan to violet gradient)
      const normalizedY = (y + 5) / 10;
      colors[i3] = 0.02 + normalizedY * 0.53; // R: cyan to violet
      colors[i3 + 1] = 0.71 - normalizedY * 0.39; // G
      colors[i3 + 2] = 0.83 + normalizedY * 0.17; // B
    }
    
    return { positions, colors };
  }, [pointCount, spread]);

  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.02;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
      />
    </points>
  );
}

// Camera Frustum for SfM visualization
function CameraFrustum({ position, rotation, color = '#06b6d4' }: {
  position: [number, number, number];
  rotation: [number, number, number];
  color?: string;
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Camera body */}
      <mesh>
        <boxGeometry args={[0.4, 0.3, 0.2]} />
        <meshStandardMaterial color={color} transparent opacity={0.8} />
      </mesh>
      {/* Frustum lines */}
      <lineSegments>
        <edgesGeometry args={[new THREE.ConeGeometry(0.5, 1, 4)]} />
        <lineBasicMaterial color={color} transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

// LoD1 Building Model
function LoD1Building({ position, width, depth, height, color = '#10b981' }: {
  position: [number, number, number];
  width: number;
  depth: number;
  height: number;
  color?: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.85}
        roughness={0.4}
        metalness={0.1}
      />
    </mesh>
  );
}

// Sample buildings for demo
function SampleBuildings() {
  const buildings = useMemo(() => [
    { position: [-8, 2, -5] as [number, number, number], width: 4, depth: 3, height: 4 },
    { position: [5, 3, 8] as [number, number, number], width: 5, depth: 4, height: 6 },
    { position: [10, 1.5, -10] as [number, number, number], width: 3, depth: 3, height: 3 },
    { position: [-12, 2.5, 6] as [number, number, number], width: 4, depth: 5, height: 5 },
    { position: [0, 4, 0] as [number, number, number], width: 6, depth: 6, height: 8 },
  ], []);

  return (
    <group>
      {buildings.map((b, i) => (
        <LoD1Building key={i} {...b} />
      ))}
    </group>
  );
}

// Sample camera frustums
function SampleCameras() {
  const cameras = useMemo(() => {
    const result = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const radius = 20;
      result.push({
        position: [
          Math.cos(angle) * radius,
          15 + Math.random() * 5,
          Math.sin(angle) * radius,
        ] as [number, number, number],
        rotation: [
          -Math.PI / 3,
          angle + Math.PI,
          0,
        ] as [number, number, number],
      });
    }
    return result;
  }, []);

  return (
    <group>
      {cameras.map((cam, i) => (
        <CameraFrustum key={i} {...cam} />
      ))}
    </group>
  );
}

// Synchronized camera controller
function SyncedCameraController() {
  const { mapViewState } = usePipelineStore();
  const { camera } = useThree();
  
  useFrame(() => {
    // Sync camera position based on 2D map view
    const zoom = mapViewState.zoom;
    const distance = Math.max(10, 100 - zoom * 5);
    
    // Smooth interpolation
    camera.position.y += (distance * 0.7 - camera.position.y) * 0.05;
  });

  return null;
}

interface Viewport3DProps {
  className?: string;
  showPointCloud?: boolean;
  showCameras?: boolean;
  showBuildings?: boolean;
}

export function Viewport3D({
  className,
  showPointCloud = true,
  showCameras = false,
  showBuildings = false,
}: Viewport3DProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const { activeStageId } = usePipelineStore();

  // Determine what to show based on active stage
  const showElements = useMemo(() => {
    switch (activeStageId) {
      case 'diagnostic':
      case 'intake':
        return { pointCloud: false, cameras: false, buildings: false };
      case 'sfm':
        return { pointCloud: true, cameras: true, buildings: false };
      case 'dense_cloud':
      case 'dsm_dtm':
        return { pointCloud: true, cameras: false, buildings: false };
      case 'segmentation':
      case 'lod_modeling':
      case 'validation':
      case 'analytics':
      case 'export':
        return { pointCloud: true, cameras: false, buildings: true };
      default:
        return { pointCloud: showPointCloud, cameras: showCameras, buildings: showBuildings };
    }
  }, [activeStageId, showPointCloud, showCameras, showBuildings]);

  return (
    <div className={cn('relative w-full h-full bg-[#020617]', className)}>
      {/* Loading overlay */}
      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground font-mono">Initializing 3D engine...</span>
          </div>
        </div>
      )}

      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        onCreated={() => setIsLoaded(true)}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={['#020617']} />
        
        <PerspectiveCamera makeDefault position={[30, 40, 30]} fov={50} />
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={10}
          maxDistance={150}
          maxPolarAngle={Math.PI / 2.1}
        />
        
        <SyncedCameraController />

        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[50, 50, 25]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <pointLight position={[-20, 20, -20]} intensity={0.5} color="#06b6d4" />
        <pointLight position={[20, 20, 20]} intensity={0.3} color="#8c52ff" />

        {/* Environment */}
        <Stars radius={100} depth={50} count={1000} factor={2} fade speed={0.5} />
        
        {/* Ground grid */}
        <Grid
          args={[100, 100]}
          cellSize={2}
          cellThickness={0.5}
          cellColor="#1e293b"
          sectionSize={10}
          sectionThickness={1}
          sectionColor="#334155"
          fadeDistance={100}
          infiniteGrid
        />

        {/* Content based on stage */}
        {showElements.pointCloud && <PointCloud pointCount={15000} spread={60} />}
        {showElements.cameras && <SampleCameras />}
        {showElements.buildings && <SampleBuildings />}
      </Canvas>

      {/* 3D info overlay */}
      <div className="absolute top-3 left-3 z-10">
        <div className="glass-panel px-3 py-1.5 rounded-md">
          <span className="text-xs font-mono text-violet-400">3D VIEW</span>
        </div>
      </div>

      {/* Stage indicator */}
      <div className="absolute bottom-3 left-3 z-10">
        <div className="glass-panel px-3 py-1.5 rounded-md flex items-center gap-2">
          {showElements.pointCloud && (
            <span className="text-xs font-mono text-cyan-400">POINT_CLOUD</span>
          )}
          {showElements.cameras && (
            <span className="text-xs font-mono text-cyan-400">CAMERAS</span>
          )}
          {showElements.buildings && (
            <span className="text-xs font-mono text-emerald-400">LOD1</span>
          )}
        </div>
      </div>
    </div>
  );
}
