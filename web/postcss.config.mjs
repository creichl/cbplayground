// Tailwind CSS runs as a PostCSS plugin, not as a Vite plugin: Vite loads this file from the project folder for every
// Vite configuration (unless it sets css.postcss itself), so the guest pages get their utilities also when the frontend
// is started with a configuration other than vite.config.ts. See README, "Design system".
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
