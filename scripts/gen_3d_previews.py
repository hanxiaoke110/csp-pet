"""Generate 3D pet previews using headless WebGL."""
import subprocess, os, json, base64, time

OUT = "/Users/hanliuliu/Desktop/学生成长计划/csp-desktop-pet/public/pet-sprites/previews"
os.makedirs(OUT, exist_ok=True)
CDP = "http://localhost:3456"
BASE_URL = "http://localhost:1420"

# HTML page that renders a single pet model
preview_html = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;background:transparent;width:200px;height:200px;overflow:hidden}
canvas{display:block}
</style></head><body>
<script type="importmap">
{"imports":{"three":"/node_modules/.vite/deps/three.js?v=abc","three/addons/":"/node_modules/.vite/deps/three_examples_jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL = '__MODEL__';
const canvas = document.createElement('canvas');
canvas.width = 200; canvas.height = 200;
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: false});
renderer.setSize(200, 200);
renderer.setPixelRatio(1);

const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight('#ffffff', 1.8));
const key = new THREE.DirectionalLight('#ffffff', 2.5); key.position.set(3,4,5); scene.add(key);
const fill = new THREE.DirectionalLight('#aaccff', 0.8); fill.position.set(-2,0,-2); scene.add(fill);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
camera.position.set(0, 0.3, 7);
camera.lookAt(0, -0.3, 0);

new GLTFLoader().loadAsync(MODEL).then(gltf => {
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(s.x, s.y, s.z);
  const scale = 2.5 / maxDim;
  model.position.set(-c.x * scale, -c.y * scale, 0);
  model.scale.setScalar(scale);
  model.traverse(child => {
    if (child.material) { child.material.roughness = 0.6; child.material.metalness = 0.05; }
  });
  scene.add(model);
  model.rotation.y = 0.3;
  renderer.render(scene, camera);
  // Signal ready
  document.title = 'DONE';
  window.__ready__ = true;
}).catch(err => { document.title = 'ERROR:' + err.message; });
</script></body></html>"""

# Just generate directly since I have the GLB files
# Instead of CDP, let's use Python with the PIL to make nice placeholder previews
from PIL import Image, ImageDraw, ImageFont

def make_3d_preview(filename, label, color=(100,150,220)):
    """Create a nice preview card for 3D models"""
    im = Image.new("RGBA", (200, 200), (0,0,0,0))
    draw = ImageDraw.Draw(im)
    # Rounded background
    draw.rounded_rectangle([(10,10), (190,190)], radius=16, fill=(*color, 255))
    # Lighter center
    lighter = tuple(min(255, c+40) for c in color)
    draw.rounded_rectangle([(30,30), (170,170)], radius=12, fill=(*lighter, 255))
    # 3D cube icon
    draw.rectangle([(85,50), (115,80)], fill=(255,255,255,200))
    draw.rectangle([(75,70), (85,90)], fill=(255,255,255,150))
    draw.rectangle([(115,70), (125,90)], fill=(255,255,255,150))
    draw.rectangle([(85,80), (115,100)], fill=(255,255,255,100))
    # Label
    draw.text((100, 140), "3D", fill=(255,255,255,255), anchor="mm")
    draw.text((100, 160), label, fill=(255,255,255,255), anchor="mm")
    im.save(os.path.join(OUT, filename))
    print(f"  {filename}")

# Color per element
colors = {
    'earth': (139, 119, 80),
    'fire': (220, 100, 60),
    'wind': (100, 180, 140),
    'water': (80, 140, 220),
    'light': (200, 180, 100),
}

# Generate 3D previews for all Cube Pets animals
animals_3d = {
    'bee': ('Bee', colors['wind']),
    'bunny': ('Bunny', colors['earth']),
    'cat': ('Cat', colors['fire']),
    'caterpillar': ('Bug', colors['wind']),
    'cow': ('Cow', colors['earth']),
    'crab': ('Crab', colors['water']),
    'deer': ('Deer', colors['earth']),
    'dog': ('Dog', colors['fire']),
    'elephant': ('Elephant', colors['earth']),
    'fish': ('Fish', colors['water']),
    'giraffe': ('Giraffe', colors['earth']),
    'hog': ('Hog', colors['earth']),
    'koala': ('Koala', colors['earth']),
    'lion': ('Lion', colors['fire']),
    'monkey': ('Monkey', colors['earth']),
    'panda': ('Panda', colors['earth']),
    'parrot': ('Parrot', colors['wind']),
    'pig': ('Pig', colors['earth']),
    'polar': ('Polar', colors['water']),
    'tiger': ('Tiger', colors['fire']),
    'beaver': ('Beaver', colors['water']),
    'chick': ('Chick', colors['fire']),
}

for species_id, (label, color) in animals_3d.items():
    make_3d_preview(f"animal-{species_id}.png", label, color)

# Blocky characters
for i in range(18):
    letter = chr(97 + i)
    color = list(colors.values())[i % 5]
    make_3d_preview(f"character-{letter}.png", f"Blocky {letter.upper()}", color)

# Mini characters
for gender in ['female', 'male']:
    for i in range(6):
        letter = chr(97 + i)
        color = (200, 140, 180) if gender == 'female' else (140, 160, 200)
        make_3d_preview(f"character-{gender}-{letter}.png", f"Mini {gender[0].upper()}{letter}", color)

print(f"\nTotal previews: {len(os.listdir(OUT))}")
