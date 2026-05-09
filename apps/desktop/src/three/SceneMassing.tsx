import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type SceneMassingProps = {
  showMassing: boolean;
  showGrid: boolean;
  groundColor: string;
  bronzeTintColor?: string;
  bronzeTintStrength?: number;
  groundMetalness?: number;
  groundRoughness?: number;
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
const GRID_OPACITY_SCALE = 0.52;
const groundPosY = FLOOR_Y + GROUND_TOP_OFFSET - GROUND_THICKNESS / 2;

function applyGridOpacity(grid: THREE.GridHelper, opacity: number) {
  const materials = Array.isArray(grid.material)
    ? grid.material
    : [grid.material];
  for (const material of materials) {
    const lineMaterial = material as THREE.LineBasicMaterial;
    lineMaterial.transparent = true;
    lineMaterial.opacity = opacity;
    lineMaterial.needsUpdate = true;
  }
}

export function SceneMassing({
  showMassing,
  showGrid,
  groundColor,
  bronzeTintColor,
  bronzeTintStrength = 0,
  groundMetalness = 0,
  groundRoughness = 0.95,
  gridMain,
  gridSub,
  gridOpacity,
}: SceneMassingProps) {
  const groundMaterialColor = useMemo(() => {
    const base = new THREE.Color(groundColor);
    const studioGray = new THREE.Color("#8D939C");
    base.lerp(studioGray, 0.18);
    if (bronzeTintColor && bronzeTintStrength > 0) {
      base.lerp(new THREE.Color(bronzeTintColor), bronzeTintStrength);
    }
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    if (hsl.l < 0.42) {
      base.lerp(new THREE.Color("#949AA3"), 0.22);
    }
    return base;
  }, [bronzeTintColor, bronzeTintStrength, groundColor]);
  const massingMaterialColor = useMemo(() => {
    return new THREE.Color("#B9BFC7");
  }, []);

  const grid = useMemo(() => {
    const nextGrid = new THREE.GridHelper(100, 20, gridMain, gridSub);
    applyGridOpacity(nextGrid, gridOpacity * GRID_OPACITY_SCALE);
    return nextGrid;
  }, [gridMain, gridOpacity, gridSub]);

  useFrame(({ camera }) => {
    const dist = camera.position.length();
    const opacity = THREE.MathUtils.clamp(
      gridOpacity * GRID_OPACITY_SCALE * (1.0 - (dist - 5) / 40),
      0.05,
      gridOpacity * GRID_OPACITY_SCALE,
    );
    applyGridOpacity(grid, opacity);
  });

  useEffect(() => {
    console.info("[VOLUMIA][viewer] ground plane material initialized", {
      groundColor: groundMaterialColor.getStyle(),
      groundMetalness,
      groundRoughness,
      gridMain,
      gridSub,
      gridOpacity,
    });
  }, [
    gridMain,
    gridOpacity,
    gridSub,
    groundMaterialColor,
    groundMetalness,
    groundRoughness,
  ]);

  return (
    <>
      {showGrid ? (
        <primitive object={grid} position={[0, FLOOR_Y + GRID_OFFSET, 0]} />
      ) : null}
      <mesh position={[0, groundPosY, 0]} receiveShadow>
        <boxGeometry args={[18, GROUND_THICKNESS, 18]} />
        <meshStandardMaterial
          color={groundMaterialColor}
          roughness={groundRoughness}
          metalness={groundMetalness}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {showMassing ? (
        <mesh position={[0, MASSING_CENTER_Y, 0]} castShadow receiveShadow>
          <boxGeometry args={MASSING_SIZE} />
          <meshStandardMaterial
            color={massingMaterialColor}
            metalness={0.08}
            roughness={0.78}
          />
        </mesh>
      ) : null}
    </>
  );
}
