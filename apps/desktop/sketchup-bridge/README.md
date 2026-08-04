# VOLUMIA Bridge para SketchUp

1. Cerrá SketchUp.
2. Copiá `VOLUMIA_Bridge.rb` a la carpeta `Plugins` de tu instalación de SketchUp.
3. En VOLUMIA, configurá esa misma carpeta en **Configuración > Carpeta Plugins de SketchUp**.
4. Abrí SketchUp una vez. La tarjeta **SketchUp Bridge** cambiará a **Verificado** cuando la extensión responda.
5. En SketchUp elegí **Extensions > Importar DAE de VOLUMIA**, seleccioná el `asset.dae` o `asset.glb` de la versión preparada y guardá el modelo como `.skp`. Si elegís el GLB, el bridge resuelve su `asset.dae` asociado mediante `asset.volumia.json` local.

El bridge intercambia archivos locales: el DAE generado por Blender conserva, en la medida que permite Collada, los nombres de mallas y materiales. No reemplaza ni modifica el activo original de VOLUMIA.
