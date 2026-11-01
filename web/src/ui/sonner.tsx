import type { CSSProperties } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * Where toasts (sonner) appear: put it once into the area that shows them; `toast('…')` from 'sonner' shows one. The toasts
 * take the surface and text colours of the area; pass `theme="dark"` in the dark mode.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius-xl)',
          fontFamily: 'var(--font-sans)',
        } as CSSProperties
      }
      // Inline, so it wins over sonner's own shadow: none in the dark mode.
      toastOptions={{ style: { boxShadow: 'var(--elevation-float)' } }}
      {...props}
    />
  )
}

export { Toaster }
