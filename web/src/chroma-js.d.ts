// chroma-js comes without types; declared here is only what the app uses.
declare module 'chroma-js' {
  const chroma: {
    /** The contrast ratio of two colours after WCAG, 1–21. */
    contrast(a: string, b: string): number
  }
  export default chroma
}
