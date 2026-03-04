import bpy
import sys
import os

argv = sys.argv
argv = argv[argv.index("--") + 1:]

mesh_path = argv[0]
image_path = argv[1]
output_path = argv[2]

# Limpiar escena
bpy.ops.wm.read_factory_settings(use_empty=True)

# Importar mesh
if mesh_path.endswith(".obj"):
    bpy.ops.wm.obj_import(filepath=mesh_path)
elif mesh_path.endswith(".ply"):
    bpy.ops.wm.ply_import(filepath=mesh_path)

obj = bpy.context.selected_objects[0]
bpy.context.view_layer.objects.active = obj

# UV automático
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.uv.smart_project()
bpy.ops.object.mode_set(mode='OBJECT')

# Crear material
mat = bpy.data.materials.new(name="AutoMaterial")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links

bsdf = nodes.get("Principled BSDF")

tex_image = nodes.new("ShaderNodeTexImage")
tex_image.image = bpy.data.images.load(image_path)

links.new(tex_image.outputs["Color"], bsdf.inputs["Base Color"])

obj.data.materials.append(mat)

# Exportar GLB
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_apply=True
)

print("DONE")