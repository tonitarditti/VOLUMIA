import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  VIEWER_FALLBACK_CLAY_COLOR,
  evaluateViewerMaterialPolicy,
} from "./viewerMaterialPolicy";

function createMesh(material?: THREE.Material) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [
        0, 0,
        1, 0,
        1, 1,
        0, 1,
        0, 0,
        1, 0,
        1, 1,
        0, 1,
      ],
      2,
    ),
  );
  return new THREE.Mesh(geometry, material);
}

describe("viewerMaterialPolicy", () => {
  it("uses textured_final when valid texture maps are present", () => {
    const root = new THREE.Group();
    const texture = new THREE.Texture();
    (texture as THREE.Texture & { image?: { width: number; height: number } }).image = {
      width: 4,
      height: 4,
    };
    const mesh = createMesh(
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        map: texture,
      }),
    );
    root.add(mesh);

    const result = evaluateViewerMaterialPolicy(root, {
      textureStatus: "ready",
      textureValidation: {
        ok: true,
        hasMaterials: true,
        hasImages: true,
        hasTextures: true,
        hasMaterialTextureBinding: true,
      },
    });

    expect(result.renderState).toBe("textured_final");
    expect(result.fallbackApplied).toBe(false);
  });

  it("forces clay fallback when no valid textures are available", () => {
    const root = new THREE.Group();
    const mesh = createMesh(
      new THREE.MeshStandardMaterial({
        color: "#000000",
      }),
    );
    root.add(mesh);

    const result = evaluateViewerMaterialPolicy(root, {
      textureStatus: "failed",
      textureValidation: {
        ok: false,
        hasMaterials: true,
        hasImages: false,
        hasTextures: false,
        hasMaterialTextureBinding: false,
        reason: "texgen failed",
      },
    });

    expect(result.renderState).toBe("texgen_failed");
    expect(result.fallbackApplied).toBe(true);
    const appliedMaterial = mesh.material as THREE.MeshStandardMaterial;
    expect(appliedMaterial.color.getHexString()).toBe(
      new THREE.Color(VIEWER_FALLBACK_CLAY_COLOR).getHexString(),
    );
  });

  it("marks an empty object as invalid_asset", () => {
    const root = new THREE.Group();
    const result = evaluateViewerMaterialPolicy(root, {});

    expect(result.renderState).toBe("invalid_asset");
    expect(result.meshCount).toBe(0);
  });
});
