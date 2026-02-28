import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type SceneMassingProps = {
  showMassing: boolean;
  groundColor: string;
  gridMain: string;
  gridSub: string;
  gridOpacity: number;
};

const DEFAULT_MASSING_SCALE = 0.25;
const MASSING_BASE_SIZE: [number, number, number] = [4.6, 3.2, 2.8];
const MASSING_SIZE: [number, number, number] = [
  MASSING_BASE_SIZE[0] * DEFAULT_MASSING_SCALE,
  MASSING_BASE_SIZE[1] * DEFAULT_MASSING_SCALE,
  MASSING_BASE_SIZE[2] * DEFAULT_MASSING_SCALE,
];
const MASSING_CENTER_Y = MASSING_SIZE[1] * 0.5;
const FLOOR_Y = 0;
const GROUND_THICKNESS = 0.1;
const GROUND_TOP_OFFSET = -0.01;
const GRID_OFFSET = 0.001;
const groundPosY = (FLOOR_Y + GROUND_TOP_OFFSET) - (GROUND_THICKNESS / 2);

function applyGridOpacity(grid: THREE.GridHelper, opacity: number) {
  const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const material of materials) {
    const lineMaterial = material as THREE.LineBasicMaterial;
    lineMaterial.transparent = true;
    lineMaterial.opacity = opacity;
    lineMaterial.needsUpdate = true;
  }
}

export function SceneMassing({ showMassing, groundColor, gridMain, gridSub, gridOpacity }: SceneMassingProps) {
  const grid = useMemo(() => {
    const nextGrid = new THREE.GridHelper(100, 20, gridMain, gridSub);
    applyGridOpacity(nextGrid, gridOpacity);
    return nextGrid;
  }, [gridMain, gridOpacity, gridSub]);

  useFrame(({ camera }) => {
    const dist = camera.position.length();
    const opacity = THREE.MathUtils.clamp(gridOpacity * (1.0 - (dist - 5) / 40), 0.08, gridOpacity);
    applyGridOpacity(grid, opacity);
  });

  return (
    <>
      <primitive object={grid} position={[0, FLOOR_Y + GRID_OFFSET, 0]} />
      <mesh position={[0, groundPosY, 0]} receiveShadow>
        <boxGeometry args={[18, GROUND_THICKNESS, 18]} />
        <meshStandardMaterial
          color={groundColor}
          roughness={0.95}
          metalness={0.0}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {showMassing ? (
        <mesh position={[0, MASSING_CENTER_Y, 0]} castShadow receiveShadow>
          <boxGeometry args={MASSING_SIZE} />
          <meshStandardMaterial color="#534f43" metalness={0.12} roughness={0.72} />
        </mesh>
      ) : null}
    </>
  );
}
