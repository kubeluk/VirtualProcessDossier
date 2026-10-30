# RDF data guidance

## Suggested IRI naming strategy

This is a suggested convention for new RDF examples and deliberate identifier
updates. It is applied in `material-example.ttl`. Other data files and generators
still use legacy namespaces; this suggestion does not request their migration.

- Use prefixed names for vocabulary terms, such as `for:Laminate`,
  `param:hasNeedlePoint`, and `qudt:hasUnit`.
- Use relative IRIs for named instances, with an explicit, stable
  `@base <http://purl.org/for/> .` declaration and a `data/` path. Prefixed names
  and relative IRIs are alternative Turtle spellings; identity depends on the
  resulting absolute IRI. Preserve existing vocabulary IRIs.
- Group a laminate and resources belonging specifically to it under
  `data/laminate/{id}#`. Use `#it` for the laminate, `#layup` for its layup,
  `#origin` for its reference point, and `#needle-point-{id}` for needle points.
  These resources share one document IRI, with distinct fragments.
- Give independently tracked physical tapes their own identifiers under
  `data/tape/{id}#it`. Keep a tape's identifier if it moves to another layup.
  For a planned ply that exists only within one laminate description,
  `data/laminate/{id}#ply-{id}` is an alternative; choose based on what the
  resource represents.
- Assign stable IDs once. Do not generate identity from mutable labels,
  materials, orientations, or current positions in the stack. Needle-point and
  ply IDs are local identifiers, not instructions to renumber after reordering.
- Keep blank nodes for quantities, qualified derivations, and RDF list cells
  that do not need independent references. A label such as
  `_:numericLiteralShape` is also a blank node, not a persistent public IRI.
- Use a namespace controlled by the project. An identifier does not by itself
  configure PURL redirects or publish its description.

Examples with the base above:

| Resource | Relative IRI |
| --- | --- |
| Laminate | `<data/laminate/1#it>` |
| Its layup | `<data/laminate/1#layup>` |
| Its reference point | `<data/laminate/1#origin>` |
| Its first needle point | `<data/laminate/1#needle-point-1>` |
| Independently tracked tape | `<data/tape/1#it>` |

When applying a rename, update every occurrence, including list entries and
provenance links. Treat an IRI change as an identity change for external consumers;
coordinate migrations of linked files and existing stores when those are in scope.
Check Turtle parsing, graph equivalence after the intended renaming, and existing
SHACL constraints. `material-example.ttl` includes `sh:sparql` constraints and needs
a SHACL-SPARQL validator; with `shacl-engine`, enable `validations` from
`shacl-engine/sparql.js`.

References: [Turtle IRI syntax](https://www.w3.org/TR/turtle/#sec-iris) and
[W3C guidance on choosing hash or slash IRIs](https://www.w3.org/TR/cooluris/#choosing).
