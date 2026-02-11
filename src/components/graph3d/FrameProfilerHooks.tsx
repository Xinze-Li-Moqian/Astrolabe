'use client'

/**
 * FrameProfilerHooks - Establishes frame boundaries for the profiler.
 *
 * Must be mounted inside the R3F Canvas.
 *
 * R3F rendering rules:
 * - useFrame callbacks run in ascending priority order (lower = first)
 * - Any callback with priority > 0 DISABLES auto-rendering (gl.render)
 * - So the high-priority endFrame hook must explicitly call gl.render()
 *
 * Priority -10000: beginFrame (runs before all default-priority hooks)
 * Priority +10000: render scene + endFrame (runs after all hooks)
 */

import { useFrame } from '@react-three/fiber'
import { profiler } from '@/lib/profiler'

export function FrameProfilerHooks() {
  // Begin frame - runs FIRST
  useFrame(() => {
    profiler.beginFrame()
  }, -10000)

  // Render scene + end frame - runs LAST
  // Because priority > 0, R3F won't auto-render; we do it here
  useFrame(({ gl, scene, camera }) => {
    profiler.span('frame.render.gl', () => {
      gl.render(scene, camera)
    })

    if (profiler.enabled) {
      const info = gl.info
      profiler.recordMetrics({
        rendererStats: {
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
        },
      })
    }

    profiler.endFrame()
  }, 10000)

  return null
}
