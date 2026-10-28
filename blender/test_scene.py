"""Тест Blender без экрана: куб, сфера, камера, свет, анимация вращения.

<python из окружения с bpy> test_scene.py <папка_вывода> [engine] [кадры] [ширина] [сэмплы]
engine: CYCLES (по умолчанию) или BLENDER_EEVEE
"""
import sys
import time
from pathlib import Path

import bpy

out = Path(sys.argv[1])
engine = sys.argv[2] if len(sys.argv) > 2 else 'CYCLES'
frames = int(sys.argv[3]) if len(sys.argv) > 3 else 2
width = int(sys.argv[4]) if len(sys.argv) > 4 else 960
samples = int(sys.argv[5]) if len(sys.argv) > 5 else 32
out.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = engine
sc.render.resolution_x = width
sc.render.resolution_y = width * 9 // 16
sc.render.resolution_percentage = 100
sc.render.fps = 24
sc.frame_start, sc.frame_end = 1, 48
if engine == 'CYCLES':
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True


def mat(name, rgb, rough=0.4):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    return m


bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
bpy.context.object.data.materials.append(mat('floor', (0.8, 0.78, 0.7), 0.8))

bpy.ops.mesh.primitive_cube_add(size=1.4, location=(-1.2, 0, 0.7))
cube = bpy.context.object
cube.data.materials.append(mat('cube', (0.9, 0.25, 0.2)))

bpy.ops.mesh.primitive_uv_sphere_add(radius=0.8, location=(1.4, 0, 0.8), segments=48, ring_count=24)
sphere = bpy.context.object
bpy.ops.object.shade_smooth()
sphere.data.materials.append(mat('sphere', (0.2, 0.5, 0.9), 0.15))

# В Blender 5 у действий нет .fcurves: линейность задаём до вставки ключей.
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
for ob in (cube, sphere):
    ob.rotation_euler = (0, 0, 0)
    ob.keyframe_insert('rotation_euler', frame=1)
    ob.rotation_euler = (0, 0, 6.2832)
    ob.keyframe_insert('rotation_euler', frame=48)

bpy.ops.object.light_add(type='AREA', location=(2.5, -3, 5))
bpy.context.object.data.energy = 500
bpy.context.object.data.size = 4
bpy.ops.object.light_add(type='SUN', rotation=(0.8, 0.2, 0.5))
bpy.context.object.data.energy = 2

bpy.ops.object.empty_add(location=(0, 0, 0.8))
target = bpy.context.object
bpy.ops.object.camera_add(location=(0, -7.5, 2.6))
sc.camera = bpy.context.object
tr = sc.camera.constraints.new('TRACK_TO')
tr.target = target
tr.track_axis = 'TRACK_NEGATIVE_Z'
tr.up_axis = 'UP_Y'
sc.camera.data.lens = 35

world = bpy.data.worlds.new('w')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.82, 0.9, 1)
sc.world = world

bpy.ops.wm.save_as_mainfile(filepath=str(out / 'test.blend'))

t_all = time.time()
for f in range(1, frames + 1):
    fr = 1 + (f - 1) * 47 // max(1, frames - 1)
    sc.frame_set(fr)
    sc.render.filepath = str(out / f'f{f:03d}.png')
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f'кадр {fr}: {time.time() - t0:.1f} с ({engine}, {width}px, {samples} сэмплов)', flush=True)
print(f'всего: {time.time() - t_all:.1f} с')
