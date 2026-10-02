// Wrangler bundles *.txt imports as Text modules.
declare module '*.txt' {
  const text: string;
  export default text;
}
