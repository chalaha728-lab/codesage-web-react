import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Model3DData } from "../types";

interface Props {
  data: Model3DData;
}

export default function ThreeCanvas({ data }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [showScript, setShowScript] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = 280;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0c0d12");

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 3, 6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.replaceChildren(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0x7c5cff, 0.8);
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);

    // Grid Floor
    const grid = new THREE.GridHelper(10, 10, 0x343946, 0x1f232d);
    grid.position.y = -0.01;
    scene.add(grid);

    // Build 3D Primitives into scene
    const group = new THREE.Group();

    data.primitives.forEach((prim) => {
      let geo: THREE.BufferGeometry;
      const color = prim.color || "#7c5cff";
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: 0.2,
      });

      switch (prim.type) {
        case "sphere":
          geo = new THREE.SphereGeometry(1, 32, 32);
          break;
        case "cylinder":
          geo = new THREE.CylinderGeometry(1, 1, 2, 32);
          break;
        case "cone":
          geo = new THREE.ConeGeometry(1, 2, 32);
          break;
        case "torus":
          geo = new THREE.TorusGeometry(1, 0.4, 16, 100);
          break;
        case "tree": {
          // Low-poly tree trunk + foliage
          const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.2, 8);
          const trunkMat = new THREE.MeshStandardMaterial({ color: "#8b5a2b" });
          const trunk = new THREE.Mesh(trunkGeo, trunkMat);
          trunk.position.y = 0.6;
          group.add(trunk);

          const leavesGeo = new THREE.ConeGeometry(1, 2, 8);
          const leavesMat = new THREE.MeshStandardMaterial({ color: "#2e8b57" });
          const leaves = new THREE.Mesh(leavesGeo, leavesMat);
          leaves.position.y = 2;
          group.add(leaves);
          return;
        }
        case "box":
        default:
          geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
          break;
      }

      const mesh = new THREE.Mesh(geo, mat);
      if (prim.position) mesh.position.set(...prim.position);
      if (prim.scale) mesh.scale.set(...prim.scale);
      group.add(mesh);
    });

    scene.add(group);

    // Smooth Slow Auto-Rotation Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      group.rotation.y += 0.008;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (container) container.replaceChildren();
    };
  }, [data]);

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(data.blenderScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavail */
    }
  };

  const downloadPy = () => {
    const blob = new Blob([data.blenderScript], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.title.toLowerCase().replace(/\s+/g, "_")}_blender.py`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="canvas-card">
      <div className="canvas-header">
        <span className="canvas-title">🧊 3D Viewport: {data.title}</span>
        <div className="canvas-actions">
          <button type="button" className="btn-sm" onClick={copyScript}>
            {copied ? "✓ Copied .py" : "📋 Copy Blender Script"}
          </button>
          <button type="button" className="btn-sm" onClick={downloadPy}>
            💾 Download .py
          </button>
          <button
            type="button"
            className="btn-sm"
            onClick={() => setShowScript((s) => !s)}
          >
            {showScript ? "Hide Code" : "View Code"}
          </button>
        </div>
      </div>

      <div ref={mountRef} className="canvas-viewport" />

      {showScript && (
        <pre className="blender-code-block">
          <code>{data.blenderScript}</code>
        </pre>
      )}
    </div>
  );
}
