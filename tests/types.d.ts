declare module 'rdf-canonize' {
  const canonicalizer: {
    canonize(
      input: string,
      options: { algorithm: string; inputFormat: string; maxDeepIterations: number },
    ): Promise<string>
  }
  export default canonicalizer
}
