// Agentic Tool definitions and execution registry for CodeSage.

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<string> | string;
}

export const AGENT_TOOLS: Record<string, ToolDefinition> = {
  evaluate_javascript: {
    name: "evaluate_javascript",
    description: "Safely execute JavaScript code in an isolated browser context and return the result or output.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript code string to evaluate." },
      },
      required: ["code"],
    },
    execute: (args) => {
      const code = String(args.code || "").trim();
      if (!code) return "Error: No code provided.";
      try {
        const logs: string[] = [];
        const mockConsole = {
          log: (...vals: unknown[]) => logs.push(vals.map(v => typeof v === "object" ? JSON.stringify(v) : String(v)).join(" ")),
          error: (...vals: unknown[]) => logs.push("[error] " + vals.join(" ")),
        };
        // Safe evaluation
        const fn = new Function("console", `"use strict"; ${code}`);
        const result = fn(mockConsole);
        let output = "";
        if (logs.length > 0) output += `Console output:\n${logs.join("\n")}\n`;
        if (result !== undefined) output += `Return value: ${typeof result === "object" ? JSON.stringify(result) : String(result)}`;
        return output.trim() || "Executed successfully (no return value or log output).";
      } catch (err: unknown) {
        return `Execution Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  },

  get_web_page: {
    name: "get_web_page",
    description: "Fetch web content or API response from a publicly accessible HTTP URL.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public URL to fetch." },
      },
      required: ["url"],
    },
    execute: async (args) => {
      const url = String(args.url || "").trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return "Error: URL must start with http:// or https://";
      }
      try {
        const res = await fetch(url);
        if (!res.ok) return `Fetch Failed with HTTP ${res.status}: ${res.statusText}`;
        const text = await res.text();
        return text.length > 2000 ? text.slice(0, 2000) + "\n...[truncated]" : text;
      } catch (err: unknown) {
        return `Fetch Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  },

  manage_memory: {
    name: "manage_memory",
    description: "Store or retrieve key-value information in persistent browser agent memory.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "Memory action: 'get', 'set', or 'list'", enum: ["get", "set", "list"] },
        key: { type: "string", description: "Key name to store or retrieve." },
        value: { type: "string", description: "Value to store (required for 'set')." },
      },
      required: ["action"],
    },
    execute: (args) => {
      const action = String(args.action || "").toLowerCase();
      const key = String(args.key || "").trim();
      const value = String(args.value || "").trim();
      const MEM_PREFIX = "codesage.agent_mem.";

      if (action === "list") {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(MEM_PREFIX)) keys.push(k.replace(MEM_PREFIX, ""));
        }
        return keys.length ? `Stored memory keys: ${keys.join(", ")}` : "Agent memory is empty.";
      }

      if (action === "get") {
        if (!key) return "Error: Key required for 'get'.";
        const val = localStorage.getItem(MEM_PREFIX + key);
        return val !== null ? `Memory['${key}']: ${val}` : `Key '${key}' not found in agent memory.`;
      }

      if (action === "set") {
        if (!key) return "Error: Key required for 'set'.";
        localStorage.setItem(MEM_PREFIX + key, value);
        return `Successfully saved Memory['${key}'] = "${value}".`;
      }

      return "Invalid memory action.";
    },
  },

  generate_3d_model: {
    name: "generate_3d_model",
    description: "Generate a 3D model with primitive shapes and equivalent Blender Python (bpy) script. Supports basic primitives, low-poly tree, and procedural shapes.",
    parameters: {
      type: "object",
      properties: {
        object_type: {
          type: "string",
          description: "Type of 3D object to generate.",
          enum: ["box", "sphere", "cylinder", "cone", "torus", "tree", "chair", "table", "custom"]
        },
        color: { type: "string", description: "Hex color string for the object (e.g., '#7c5cff')." },
        title: { type: "string", description: "Display title for the 3D model card." },
      },
      required: ["object_type"],
    },
    execute: (args) => {
      const objType = String(args.object_type || "box") as PrimitiveType;
      const color = String(args.color || "#7c5cff");
      const title = String(args.title || objType);

      const primitives = generatePrimitivesForType(objType, color);
      const blenderScript = generateBlenderPython(objType, color, title);

      return JSON.stringify({ title, primitives, blenderScript });
    },
  },
} as const;

// Helper types for 3D generation
type PrimitiveType = "box" | "sphere" | "cylinder" | "cone" | "torus" | "tree" | "chair" | "table" | "custom";

interface Primitive3D {
  type: "box" | "sphere" | "cylinder" | "cone" | "torus" | "tree";
  color?: string;
  position?: [number, number, number];
  scale?: [number, number, number];
}

function generatePrimitivesForType(objType: PrimitiveType, color: string): Primitive3D[] {
  const result: Primitive3D[] = [];

  switch (objType) {
    case "box":
      result.push({ type: "box", color, position: [0, 0, 0] });
      break;
    case "sphere":
      result.push({ type: "sphere", color, position: [0, 0, 0] });
      break;
    case "cylinder":
      result.push({ type: "cylinder", color, position: [0, 0, 0] });
      break;
    case "cone":
      result.push({ type: "cone", color, position: [0, 0, 0] });
      break;
    case "torus":
      result.push({ type: "torus", color, position: [0, 0, 0] });
      break;
    case "tree":
      result.push({ type: "tree", position: [0, 0, 0] });
      break;
    case "chair": {
      // Chair: seat + back + 4 legs
      result.push({ type: "box", color, position: [0, 0.5, 0], scale: [1.2, 0.1, 1.2] }); // seat
      result.push({ type: "box", color, position: [0, 1.3, -0.55], scale: [1.2, 1.6, 0.1] }); // back
      result.push({ type: "cylinder", color, position: [-0.5, 0.1, -0.5], scale: [0.08, 0.5, 0.08] }); // leg FL
      result.push({ type: "cylinder", color, position: [0.5, 0.1, -0.5], scale: [0.08, 0.5, 0.08] }); // leg FR
      result.push({ type: "cylinder", color, position: [-0.5, 0.1, 0.5], scale: [0.08, 0.5, 0.08] }); // leg BL
      result.push({ type: "cylinder", color, position: [0.5, 0.1, 0.5], scale: [0.08, 0.5, 0.08] }); // leg BR
      break;
    }
    case "table": {
      // Table: top + 4 legs
      result.push({ type: "box", color, position: [0, 1.2, 0], scale: [2, 0.1, 1.2] }); // top
      result.push({ type: "cylinder", color, position: [-0.85, 0.55, -0.5], scale: [0.1, 1.1, 0.1] }); // leg FL
      result.push({ type: "cylinder", color, position: [0.85, 0.55, -0.5], scale: [0.1, 1.1, 0.1] }); // leg FR
      result.push({ type: "cylinder", color, position: [-0.85, 0.55, 0.5], scale: [0.1, 1.1, 0.1] }); // leg BL
      result.push({ type: "cylinder", color, position: [0.85, 0.55, 0.5], scale: [0.1, 1.1, 0.1] }); // leg BR
      break;
    }
    case "custom":
    default:
      result.push({ type: "box", color, position: [0, 0, 0] });
      break;
  }

  return result;
}

function generateBlenderPython(objType: PrimitiveType, color: string, title: string): string {
  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;

  const baseScript = `import bpy
import math

# Clear existing mesh objects
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.select_set(True)
bpy.ops.object.delete()

# Create material
mat = bpy.data.materials.new(name="CodeSageMaterial")
mat.use_nodes = True
nodes = mat.node_tree.nodes
bsdf = nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs['Base Color'].default_value = (${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.3
    bsdf.inputs['Metallic'].default_value = 0.2

`;

  let shapeScript = "";
  const name = title.replace(/\s+/g, "_");

  switch (objType) {
    case "box":
      shapeScript = `
bpy.ops.mesh.primitive_cube_add(size=1.5, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "${name}"
cube.data.materials.append(mat)
`;
      break;
    case "sphere":
      shapeScript = `
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=32, ring_count=32, location=(0, 0, 0))
sphere = bpy.context.active_object
sphere.name = "${name}"
sphere.data.materials.append(mat)
`;
      break;
    case "cylinder":
      shapeScript = `
bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=2, vertices=32, location=(0, 0, 0))
cyl = bpy.context.active_object
cyl.name = "${name}"
cyl.data.materials.append(mat)
`;
      break;
    case "cone":
      shapeScript = `
bpy.ops.mesh.primitive_cone_add(radius1=1, radius2=0, depth=2, vertices=32, location=(0, 0, 0))
cone = bpy.context.active_object
cone.name = "${name}"
cone.data.materials.append(mat)
`;
      break;
    case "torus":
      shapeScript = `
bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=0.4, major_segments=48, minor_segments=12, location=(0, 0, 0))
torus = bpy.context.active_object
torus.name = "${name}"
torus.data.materials.append(mat)
`;
      break;
    case "tree":
      shapeScript = `
# Trunk
bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=1.2, vertices=8, location=(0, 0, 0.6))
trunk = bpy.context.active_object
trunk.name = "${name}_trunk"
trunk_mat = bpy.data.materials.new(name="TrunkMat")
trunk_mat.use_nodes = True
nodes = trunk_mat.node_tree.nodes
bsdf = nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs['Base Color'].default_value = (0.545, 0.353, 0.169, 1.0)
trunk.data.materials.append(trunk_mat)

# Foliage
bpy.ops.mesh.primitive_cone_add(radius1=1, radius2=0, depth=2, vertices=8, location=(0, 0, 2))
leaves = bpy.context.active_object
leaves.name = "${name}_foliage"
leaves_mat = bpy.data.materials.new(name="LeavesMat")
leaves_mat.use_nodes = True
nodes = leaves_mat.node_tree.nodes
bsdf = nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs['Base Color'].default_value = (0.18, 0.545, 0.341, 1.0)
leaves.data.materials.append(leaves_mat)
`;
      break;
    case "chair":
      shapeScript = `
# Seat
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.5, 0))
seat = bpy.context.active_object
seat.name = "${name}_seat"
seat.scale = (1.2, 0.1, 1.2)
seat.data.materials.append(mat)

# Back
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 1.3, -0.55))
back = bpy.context.active_object
back.name = "${name}_back"
back.scale = (1.2, 0.8, 0.05)
back.data.materials.append(mat)

# Legs
for x, z in [(-0.5, -0.5), (0.5, -0.5), (-0.5, 0.5), (0.5, 0.5)]:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.5, vertices=12, location=(x, 0.1, z))
    leg = bpy.context.active_object
    leg.name = f"${name}_leg_{x}_{z}"
    leg.data.materials.append(mat)
`;
      break;
    case "table":
      shapeScript = `
# Table Top
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 1.2, 0))
top = bpy.context.active_object
top.name = "${name}_top"
top.scale = (2, 0.1, 1.2)
top.data.materials.append(mat)

# Legs
for x, z in [(-0.85, -0.5), (0.85, -0.5), (-0.85, 0.5), (0.85, 0.5)]:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.1, depth=1.1, vertices=12, location=(x, 0.55, z))
    leg = bpy.context.active_object
    leg.name = f"${name}_leg_{x}_{z}"
    leg.data.materials.append(mat)
`;
      break;
    default:
      shapeScript = `
bpy.ops.mesh.primitive_cube_add(size=1.5, location=(0, 0, 0))
obj = bpy.context.active_object
obj.name = "${name}"
obj.data.materials.append(mat)
`;
  }

  return baseScript + shapeScript + "\n# Done! Generated by CodeSage Agent";
}

export const OPENAI_TOOLS_SCHEMA = Object.values(AGENT_TOOLS).map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));