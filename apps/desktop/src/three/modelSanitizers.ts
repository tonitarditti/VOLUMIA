import * as THREE from "three";

type StripResult = {
  removed: number;
  debug: string[];
};

type MeshCandidate = {
  mesh: THREE.Mesh;
  size: THREE.Vector3;
  bottomAligned: boolean;
  thin: boolean;
  wideInXZ: boolean;
  oversized: boolean;
  hasNameOrMaterialHint: boolean;
  label: string;
};

const KEYWORDS = ["ground", "floor", "base", "pedestal", "plane", "slab"];

function collectMaterialNames(material: THREE.Material | THREE.Material[] | undefined): string {
  if (!material) {
    return "";
  }
  if (Array.isArray(material)) {
    return material.map((entry) => entry?.name ?? "").join(" ");
  }
  return material.name ?? "";
}

export function stripGeneratedGroundPlane(root: THREE.Object3D): StripResult {
  root.updateMatrixWorld(true);
  const sceneBox = new THREE.Box3().setFromObject(root);
  if (sceneBox.isEmpty()) {
    return { removed: 0, debug: [] };
  }

  const sceneSize = sceneBox.getSize(new THREE.Vector3());
  const sceneMaxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z);
  const sceneFootprint = Math.max(sceneSize.x, sceneSize.z);
  const sceneArea = Math.max(sceneSize.x * sceneSize.z, 1e-6);
  const minY = sceneBox.min.y;

  const candidates: MeshCandidate[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.parent) {
      return;
    }

    const meshBox = new THREE.Box3().setFromObject(child);
    if (meshBox.isEmpty()) {
      return;
    }

    const size = meshBox.getSize(new THREE.Vector3());
    const footprint = Math.max(size.x, size.z);
    const areaRatio = (size.x * size.z) / sceneArea;
    const thin = size.y <= Math.max(0.02, sceneMaxDim * 0.15);
    const bottomAligned = meshBox.max.y <= minY + Math.max(sceneMaxDim * 0.28, size.y * 3.0);
    const wideInXZ = footprint >= sceneFootprint * 0.78 || areaRatio >= 0.55;
    const oversized = size.x > sceneMaxDim * 1.5 || size.z > sceneMaxDim * 1.5;

    const lowerName = `${child.name} ${collectMaterialNames(child.material)}`.toLowerCase();
    const hasNameOrMaterialHint = KEYWORDS.some((keyword) => lowerName.includes(keyword));
    const isGeneratedSlab = thin && bottomAligned && (wideInXZ || oversized || hasNameOrMaterialHint);
    if (!isGeneratedSlab) {
      return;
    }

    candidates.push({
      mesh: child,
      size,
      bottomAligned,
      thin,
      wideInXZ,
      oversized,
      hasNameOrMaterialHint,
      label: child.name || "(unnamed)",
    });
  });

  let removed = 0;
  const debug: string[] = [];
  for (const candidate of candidates) {
    if (!candidate.mesh.parent) {
      continue;
    }
    candidate.mesh.parent.remove(candidate.mesh);
    removed += 1;
    debug.push(
      `${candidate.label} size=(${candidate.size.x.toFixed(3)},${candidate.size.y.toFixed(3)},${candidate.size.z.toFixed(3)}) ` +
        `thin=${candidate.thin} bottom=${candidate.bottomAligned} wide=${candidate.wideInXZ} ` +
        `oversized=${candidate.oversized} hint=${candidate.hasNameOrMaterialHint}`
    );
  }

  if (removed > 0) {
    root.updateMatrixWorld(true);
  }

  return { removed, debug };
}
