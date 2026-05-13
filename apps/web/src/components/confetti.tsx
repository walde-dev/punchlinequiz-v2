import { useEffect, useRef } from "react"

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  size: number
  color: string
  shape: "rect" | "circle"
  life: number
}

/**
 * Lightweight gold confetti burst. Brand-aligned (gold + white only — one accent).
 * Renders, animates, cleans up. Respects prefers-reduced-motion (silent no-op).
 */
export function Confetti({ trigger }: { trigger: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!trigger) return
    if (typeof window === "undefined") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = (canvas.width = canvas.offsetWidth * dpr)
    const h = (canvas.height = canvas.offsetHeight * dpr)
    ctx.scale(dpr, dpr)

    // Pull the brand gold from CSS tokens so the burst tracks --primary, not a hex literal.
    const styles = getComputedStyle(document.documentElement)
    const primary = styles.getPropertyValue("--primary").trim() || "oklch(0.795 0.184 86.047)"
    const fg = styles.getPropertyValue("--foreground").trim() || "#ffffff"
    const colors = [primary, primary, fg]
    const count = 90
    const particles: Particle[] = []
    const cx = canvas.offsetWidth / 2
    const cy = canvas.offsetHeight / 2.2

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6
      const speed = 4 + Math.random() * 6
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: Math.random() > 0.5 ? "rect" : "circle",
        life: 1,
      })
    }

    let raf = 0
    const start = performance.now()
    const duration = 1800

    function frame(now: number) {
      const elapsed = now - start
      const t = elapsed / duration
      ctx!.clearRect(0, 0, w, h)

      for (const p of particles) {
        p.vy += 0.18 // gravity
        p.vx *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        p.life = Math.max(0, 1 - t)

        ctx!.save()
        ctx!.globalAlpha = p.life
        ctx!.translate(p.x, p.y)
        ctx!.rotate(p.rot)
        ctx!.fillStyle = p.color
        if (p.shape === "rect") {
          ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        } else {
          ctx!.beginPath()
          ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          ctx!.fill()
        }
        ctx!.restore()
      }

      if (elapsed < duration) {
        raf = requestAnimationFrame(frame)
      } else {
        ctx!.clearRect(0, 0, w, h)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [trigger])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
    />
  )
}
