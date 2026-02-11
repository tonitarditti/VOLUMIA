import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useViewportStore } from "../stores/viewport.store";

export default function Viewport3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const dims = useViewportStore((s) => s.dims);
  const original = useViewportStore((s) => s.original);
  const maintain = useViewportStore((s) => s.maintainProportions);

  const wrapperRef = useRef<THREE.Group | null>(null);

  const applyScale = () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    if (maintain) {
      const su = dims.w / original.w;
      wrapper.scale.set(su, su, su);
    } else {
      const sx = dims.w / original.w;
      const sy = dims.h / original.h;
      const sz = dims.d / original.d;
      wrapper.scale.set(sx, sy, sz);
    }

    const bbox = new THREE.Box3().setFromObject(wrapper);
    wrapper.position.y -= bbox.min.y;
  };

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#F8F5F0");

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
    camera.position.set(160, 120, 160);
    camera.lookAt(0, 40, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
    hemi.position.set(0, 200, 0);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(120, 200, 80);
    scene.add(dir);

    const grid = new THREE.GridHelper(800, 80, 0xcccccc, 0xdddddd);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.12;
    scene.add(grid);

    const wrapper = new THREE.Group();
    wrapperRef.current = wrapper;
    scene.add(wrapper);

    const mat = new THREE.MeshStandardMaterial({ color: 0xe6dfd5, roughness: 0.9, metalness: 0 });

    // "chair-like" demo
    const seat = new THREE.Mesh(new THREE.BoxGeometry(60, 6, 60), mat);
    seat.position.set(0, 45, 0);
    wrapper.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(60, 50, 6), mat);
    back.position.set(0, 70, -27);
    wrapper.add(back);

    const legGeo = new THREE.BoxGeometry(6, 45, 6);
    const legPositions = [
      [-27, 22.5, -27],
      [27, 22.5, -27],
      [-27, 22.5, 27],
      [27, 22.5, 27],
    ];
    for (const [x, y, z] of legPositions) {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(x, y, z);
      wrapper.add(leg);
    }

    // set original dims from bbox
    const bbox0 = new THREE.Box3().setFromObject(wrapper);
    const size0 = new THREE.Vector3();
    bbox0.getSize(size0);

    useViewportStore.getState().setOriginalFromModel({
      w: Math.round(size0.x),
      h: Math.round(size0.y),
      d: Math.round(size0.z),
    });

    wrapper.position.y -= bbox0.min.y;

    const resize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const tick = () => {
      wrapper.rotation.y += 0.0025;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      if (renderer.domElement.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    applyScale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims.w, dims.d, dims.h, maintain]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="viewportHeader">
        <div className="viewportTitle">Viewport</div>
        <div className="viewportMeta">Wrapper scaling - {maintain ? "Proportions ON" : "Axis ON"}</div>
      </div>
      <div ref={mountRef} className="viewportCanvas" />
    </div>
  );
}
