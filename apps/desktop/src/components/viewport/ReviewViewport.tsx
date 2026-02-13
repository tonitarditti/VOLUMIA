import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";
import type { Group, Object3D } from "three";

type ReviewViewportProps = {
  modelUrl: string | null;
};

function LoadedModel({ modelUrl }: { modelUrl: string }) {
  const loaded = useGLTF(modelUrl) as { scene?: Group | Object3D };
  const model = useMemo(() => (loaded.scene ? loaded.scene.clone() : null), [loaded.scene]);
  if (!model) {
    return <PlaceholderModel />;
  }
  return <primitive object={model} />;
}

function PlaceholderModel() {
  return (
    <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
      <boxGeometry args={[1.2, 1.2, 1.2]} />
      <meshStandardMaterial color="#A1866F" roughness={0.55} metalness={0.1} />
    </mesh>
  );
}

export function ReviewViewport({ modelUrl }: ReviewViewportProps) {
  return (
    <div className="reviewViewportCanvas">
      <Canvas camera={{ position: [3.8, 2.5, 4.6], fov: 50 }} shadows>
        <color attach="background" args={["#f6f3ed"]} />
        <ambientLight intensity={0.45} />
        <hemisphereLight args={["#ffffff", "#d8d1c7", 0.45]} />
        <directionalLight position={[6, 7, 5]} intensity={1.1} castShadow />

        <gridHelper args={[16, 16, "#d6d0c7", "#e4dfd7"]} position={[0, 0, 0]} />

        <Suspense fallback={<PlaceholderModel />}>
          {modelUrl ? <LoadedModel modelUrl={modelUrl} /> : <PlaceholderModel />}
        </Suspense>

        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.001, 0]}>
          <planeGeometry args={[24, 24]} />
          <shadowMaterial opacity={0.16} />
        </mesh>

        <ContactShadows opacity={0.3} scale={10} blur={1.6} far={2.5} resolution={512} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
