/**
 * Dev Mode Configuration
 *
 * Toggle via:
 * - Environment variable: NEXT_PUBLIC_DEV_MODE=true
 * - Console: window.__ASTROLABE_DEV__ = true (or Astrolabe.devMode(true))
 * - Console: Astrolabe.devMode() to toggle
 *
 * Metrics are handled by lib/profiler.ts; this module is the toggle mechanism.
 */

import { profiler } from './profiler'

// Global state for dev mode
let devModeEnabled = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_DEV_MODE === 'true' || (window as any).__ASTROLABE_DEV__ === true)
  : false

// Sync profiler on init
profiler.enabled = devModeEnabled

export function isDevMode(): boolean {
  if (typeof window !== 'undefined') {
    // Check runtime toggle
    if ((window as any).__ASTROLABE_DEV__ !== undefined) {
      return (window as any).__ASTROLABE_DEV__ === true
    }
  }
  return devModeEnabled
}

export function setDevMode(enabled: boolean): void {
  devModeEnabled = enabled
  profiler.enabled = enabled
  if (typeof window !== 'undefined') {
    (window as any).__ASTROLABE_DEV__ = enabled
  }
  console.log(`[DevMode] ${enabled ? 'Enabled' : 'Disabled'}`)
}

export function toggleDevMode(): boolean {
  const newState = !isDevMode()
  setDevMode(newState)
  return newState
}

// Console API
if (typeof window !== 'undefined') {
  (window as any).Astrolabe = {
    devMode: (enabled?: boolean) => {
      if (enabled === undefined) {
        return toggleDevMode()
      }
      setDevMode(enabled)
      return enabled
    },
    getMetrics: () => {
      const last = profiler.getLastFrame()
      const metrics = profiler.getLatestMetrics()
      if (!last) return null
      return {
        fps: last.dur > 0 ? Math.round(1000 / last.dur) : 0,
        frameTime: last.dur,
        nodeCount: metrics.nodeCount,
        edgeCount: metrics.edgeCount,
        stableFrames: metrics.stableFrames,
        ...metrics.rendererStats,
      }
    },
    getTraces: (count?: number) => profiler.getFrames(count),
    help: () => {
      console.log(`
Astrolabe Dev Console Commands:
  Astrolabe.devMode()       - Toggle dev mode (profiler overlay)
  Astrolabe.devMode(true)   - Enable dev mode
  Astrolabe.devMode(false)  - Disable dev mode
  Astrolabe.getMetrics()    - Get current performance metrics
  Astrolabe.getTraces(n)    - Get last n frame traces (default: 240)
      `)
    }
  }

  // Log help on first load if dev mode is enabled
  if (isDevMode()) {
    console.log('[DevMode] Enabled. Type Astrolabe.help() for commands.')
  }
}
