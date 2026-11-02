// Development only (main.tsx loads it under import.meta.env.DEV, so the production build does not contain it).
// Checks that Tailwind's utilities reached the page: Tailwind runs as a PostCSS plugin (web/postcss.config.mjs), and
// without it the guest pages fall apart without any error. This makes it obvious right away instead.
export function warnIfTailwindIsMissing() {
  // An invisible probe with a Tailwind class: with the utilities loaded, "hidden" sets display: none.
  const probe = document.createElement('div')
  probe.className = 'hidden'
  document.body.append(probe)
  const missing = getComputedStyle(probe).display !== 'none'
  probe.remove()
  if (!missing) return

  console.error(
    'Tailwind styles are missing: the class "hidden" has no effect, so the CSS of web/src/styles/app.css was not ' +
      'processed by Tailwind. Tailwind runs as a PostCSS plugin: Vite needs web/postcss.config.mjs (with ' +
      '@tailwindcss/postcss) in its project folder, and the Vite configuration must not set css.postcss itself. ' +
      'See README, "Design system".',
  )
  const bar = document.createElement('div')
  bar.setAttribute('role', 'alert')
  bar.textContent = 'Tailwind-Styles fehlen – läuft PostCSS? Siehe README („Design system“).'
  // Inline styles: without Tailwind there are no classes to style the bar with.
  bar.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:12px 16px;background:#b91c1c;color:#fff;' +
    'font:600 16px/1.4 system-ui,sans-serif;text-align:center;box-shadow:0 2px 8px rgb(0 0 0 / 0.3)'
  document.body.prepend(bar)
}
