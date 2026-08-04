const fs = require("fs");

const glbMagic = Buffer.from([0x67, 0x6c, 0x54, 0x46]);

function readGlbJson(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 100 || !buffer.subarray(0, 4).equals(glbMagic)) {
    throw new Error(`GLB inexistente, vacío o con encabezado inválido: ${filePath}`);
  }
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) {
    throw new Error(`El tamaño declarado del GLB no coincide con el archivo: ${filePath}`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a || jsonLength <= 0 || 20 + jsonLength > buffer.length) {
    throw new Error(`Chunk JSON inválido en GLB: ${filePath}`);
  }
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").replace(/\0+$/u, ""));
}

function validateMeshGlb(filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error(`No existe la malla esperada: ${filePath}`);
  const bytes = fs.statSync(filePath).size;
  if (bytes < (options.minimumBytes || 100)) throw new Error(`La malla generada es demasiado pequeña (${bytes} bytes).`);
  const gltf = readGlbJson(filePath);
  const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : [];
  if (meshes.length === 0) throw new Error("El GLB no contiene mallas.");

  let vertices = 0;
  let faces = 0;
  let uvSets = 0;
  const bounds = [];
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives || []) {
      const positionIndex = primitive.attributes?.POSITION;
      const position = Number.isInteger(positionIndex) ? gltf.accessors?.[positionIndex] : null;
      if (!position || !Number.isFinite(position.count) || position.count <= 0) continue;
      vertices += Number(position.count);
      if (!Array.isArray(position.min) || !Array.isArray(position.max) || position.min.length !== 3 || position.max.length !== 3) {
        throw new Error("La malla no contiene un bounding box POSITION verificable.");
      }
      const values = [...position.min, ...position.max].map(Number);
      if (values.some((value) => !Number.isFinite(value))) throw new Error("La malla contiene bounds NaN o infinitos.");
      bounds.push(values);
      const indexAccessor = Number.isInteger(primitive.indices) ? gltf.accessors?.[primitive.indices] : null;
      const indexCount = Number(indexAccessor?.count || 0);
      faces += indexCount > 0 ? Math.floor(indexCount / 3) : Math.floor(Number(position.count) / 3);
      if (Number.isInteger(primitive.attributes?.TEXCOORD_0)) uvSets += 1;
    }
  }
  if (vertices <= 0 || faces <= 0) throw new Error(`La malla no tiene geometría válida (vertices=${vertices}, faces=${faces}).`);
  if (bounds.length === 0) throw new Error("No se pudo validar el bounding box de la malla.");
  if (options.requireUv && uvSets <= 0) throw new Error("La malla definitiva no contiene coordenadas UV TEXCOORD_0.");
  return { filePath, bytes, meshes: meshes.length, vertices, faces, uvSets, boundsValid: true };
}

function validateTexturedGlb(filePath) {
  const mesh = validateMeshGlb(filePath, { minimumBytes: 4096, requireUv: true });
  const gltf = readGlbJson(filePath);
  const materials = Array.isArray(gltf.materials) ? gltf.materials : [];
  const images = Array.isArray(gltf.images) ? gltf.images : [];
  const textures = Array.isArray(gltf.textures) ? gltf.textures : [];
  if (!materials.length || !images.length || !textures.length) {
    throw new Error("El GLB texturizado no contiene materiales, imágenes y texturas embebidas.");
  }
  let boundPrimitiveCount = 0;
  for (const entry of gltf.meshes || []) {
    for (const primitive of entry.primitives || []) {
      const material = Number.isInteger(primitive.material) ? materials[primitive.material] : null;
      const pbr = material?.pbrMetallicRoughness;
      const hasTextureBinding = Boolean(
        pbr?.baseColorTexture ||
          pbr?.metallicRoughnessTexture ||
          material?.normalTexture ||
          material?.occlusionTexture ||
          material?.emissiveTexture
      );
      if (hasTextureBinding && Number.isInteger(primitive.attributes?.TEXCOORD_0)) {
        boundPrimitiveCount += 1;
      }
    }
  }
  if (!boundPrimitiveCount) {
    throw new Error("El GLB texturizado no tiene primitivas con material, textura y UV válidos.");
  }
  return { ...mesh, materials: materials.length, images: images.length, textures: textures.length, boundPrimitiveCount };
}

module.exports = { readGlbJson, validateMeshGlb, validateTexturedGlb };
