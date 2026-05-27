"""Batch render 3D model previews using CDP browser."""
import subprocess, os, json, base64, time, sys

CDP = "http://localhost:3456"
OUT = "/Users/hanliuliu/Desktop/学生成长计划/csp-desktop-pet/public/pet-sprites/previews"
os.makedirs(OUT, exist_ok=True)

# Create a new tab with our preview page
resp = subprocess.run(["curl", "-s", f"{CDP}/new?url=http://localhost:1420/3d-preview.html?model=/pet-sprites/3d/animal-fox.glb"],
                      capture_output=True, text=True)
try:
    tid = json.loads(resp.stdout)['targetId']
except:
    print(f"Failed to open CDP tab: {resp.stdout}")
    sys.exit(1)
print(f"Tab: {tid}")

def eval_js(code, wait=0):
    time.sleep(wait)
    resp = subprocess.run(["curl", "-s", "-X", "POST", f"{CDP}/eval?target={tid}", "-d", code],
                          capture_output=True, text=True)
    try:
        return json.loads(resp.stdout).get('value', '')
    except:
        return ''

def screenshot():
    resp = subprocess.run(["curl", "-s", f"{CDP}/screenshot?target={tid}&file=/tmp/3d-shot.png"],
                          capture_output=True, text=True)
    return 'saved' in resp.stdout

# Define models to render
models = []
# Cube Pets animals
for a in ['animal-bee','animal-bunny','animal-cat','animal-caterpillar','animal-chick',
           'animal-cow','animal-crab','animal-deer','animal-dog','animal-elephant',
           'animal-fish','animal-fox','animal-giraffe','animal-hog','animal-koala',
           'animal-lion','animal-monkey','animal-panda','animal-parrot','animal-penguin',
           'animal-pig','animal-polar','animal-tiger','animal-beaver']:
    models.append((a, f'/pet-sprites/3d/{a}.glb'))

# Blocky Characters
for i in range(18):
    c = chr(97 + i)
    models.append((f'character-{c}', f'/pet-sprites/3d/blocky/character-{c}.glb'))

# Mini Characters
for g in ['female', 'male']:
    for i in range(6):
        c = chr(97 + i)
        models.append((f'character-{g}-{c}', f'/pet-sprites/3d/mini/character-{g}-{c}.glb'))

print(f"Total: {len(models)} models")

# Process each model
success = 0
errors = []
for i, (name, path) in enumerate(models):
    # Navigate to preview page with model
    url = f"http://localhost:1420/3d-preview.html?model={path}"
    subprocess.run(["curl", "-s", f"{CDP}/navigate?target={tid}&url={url}"],
                   capture_output=True, text=True)

    # Wait for render
    time.sleep(1.5)

    # Check if render succeeded
    title = eval_js("document.title", wait=0)
    if 'ERROR' in title:
        errors.append(f"{name}: {title}")
        print(f"  [{i+1}/{len(models)}] {name} → ERROR: {title}")
        continue

    # Take screenshot
    if screenshot():
        # Crop the 200x200 from top-left and save
        from PIL import Image
        im = Image.open('/tmp/3d-shot.png')
        # The rendered model is at top-left 200x200
        preview = im.crop((0, 0, 200, 200))
        preview.save(os.path.join(OUT, f"{name}.png"))
        success += 1
        print(f"  [{i+1}/{len(models)}] {name} → OK")
    else:
        errors.append(f"{name}: screenshot failed")
        print(f"  [{i+1}/{len(models)}] {name} → SCREENSHOT FAILED")

print(f"\nDone: {success} ok, {len(errors)} errors")
for e in errors:
    print(f"  {e}")
