import { useMemo } from "react";
import * as THREE from "three";

export function SceneMassing() {
  const grid = useMemo(() => {
    return new THREE.GridHelper(40, 40, "#334155", "#1f2937");
  }, []);

  return (
    <>
      <primitive object={grid} position={[0, 0, 0]} />
      <mesh position={[0, 1.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.6, 3.2, 2.8]} />
        <meshStandardMaterial color="#6f7d8f" metalness={0.2} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[18, 0.1, 18]} />
        <meshStandardMaterial color="#131820" roughness={0.95} metalness={0.1} />
      </mesh>
    </>
  );
}
