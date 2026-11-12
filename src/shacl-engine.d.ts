declare module 'shacl-engine/Validator.js' {
  import type { Store, DataFactory } from 'n3'
  import type { Term } from '@rdfjs/types'
  export default class Validator {
    constructor(
      shapes: Store,
      options: {
        factory: typeof DataFactory & { dataset: () => Store }
        validations?: unknown
        targetResolvers?: unknown
      },
    )
    validate(
      data: { dataset: Store; terms?: Term[] },
      shapes?: { terms: Term[] }[],
    ): Promise<{ conforms: boolean; results: unknown[] }>
  }
}
declare module 'shacl-engine/sparql.js' {
  export const validations: unknown
  export const targetResolvers: unknown
}
