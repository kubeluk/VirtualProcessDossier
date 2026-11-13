# Virtual Process Dossier

VPD lets manufacturing users prepare production runs and explore their recorded context without writing SPARQL.

The overview connects production runs, input laminates, machine initialization settings, equipment, observations, and external datasets. Run preparation uses a four-step wizard: choose defaults or copy a run, confirm the laminate, configure the three machines, and review the initialization. The demonstrator records execution afterwards.

## Start with example data

```sh
docker compose up --build
```

- UI: http://localhost:8080
- Fuseki: http://localhost:3030 (development credentials: admin / admin)

On an empty store, the seed service validates and loads only the Turtle statements from the `data/` files listed in [`scripts/seed.ts`](scripts/seed.ts), preserving their identities, values, and URLs. The bundle contains the supplied completed run, its laminate and plans, the reference models and shapes, the standalone catalog records, and the three synthetic datasets declared in [`data/catalog.ttl`](data/catalog.ttl). Seeding generates no additional records. The alternative `run-view-after-ui.ttl` snapshot is excluded because it describes the same run identity in an earlier state.

Existing nonempty stores are preserved. The seed does not migrate older models or replace existing records. To explicitly reset this project's development data:

```sh
docker compose down -v
docker compose up --build
```

The reset deletes this Compose project's data volume. To use another port, set `UI_PORT` and `FUSEKI_PORT` before startup. Synthetic download URLs are loaded exactly as declared in `data/catalog.ttl`; edit that source file before seeding if another public UI origin is needed. `ADMIN_PASSWORD` configures the development Fuseki administrator.

## Develop locally

Use Node 22 and npm.

```sh
npm ci
docker compose up -d jena seed
npm run dev
```

`npm run dev` and `npm run dev:local` start at http://127.0.0.1:5173 and proxy to the local `vpd` dataset on localhost:3030. Copy `.env.example` to `.env` to configure `ADMIN_PASSWORD` consistently for Vite and the local Docker stack. For local-only URL, dataset, or credential overrides, use `.env.development.local`; keep these out of shared `.env` files so they do not affect remote mode.

To develop against the deployed store, copy `.env.remote.example` to `.env.remote.local`, replace its URL and dataset, then run:

```sh
npm run dev:remote
```

Remote development starts at http://127.0.0.1:5174. It requires an explicit `FUSEKI_PROXY_TARGET` and `FUSEKI_DATASET`; it has no localhost fallback and does not use `ADMIN_PASSWORD`. The example disables authentication. To use Basic authentication, set both `FUSEKI_USERNAME` and `FUSEKI_PASSWORD`; leave both empty for no authentication. Explicit credentials replace incoming browser credentials on both query and update requests. Without configured credentials, the proxy strips incoming Authorization headers. Local mode defaults to `admin` and `ADMIN_PASSWORD` (or `admin`).

Vite loads mode-specific environment files using the selected mode, and shell variables take priority. Restart Vite after changing settings. Startup reports the backend URL without credentials. Both development servers use strict ports; stop the process occupying the selected port instead of accepting a different origin. Separate ports keep browser session drafts separate between the local and remote stores.

Both modes support the normal read and write flows. Changes made through remote development are saved to the deployed dataset. Joining the VPN may be necessary to reach the backend.

The browser always calls `/sparql` and `/update` on the UI origin. Backend selection and credentials stay in Vite or nginx, outside the SPA bundle. The former `VITE_SPARQL_ENDPOINT` and `VITE_SPARQL_UPDATE_ENDPOINT` overrides are no longer used. `FUSEKI_PROXY_TARGET` is an HTTP(S) base URL, optionally including a proxy prefix, without a dataset suffix, embedded credentials, query string, or fragment. For example, a target of `https://store.example.org/fuseki` and dataset `vpd` produces upstream paths `/fuseki/vpd/sparql` and `/fuseki/vpd/update`. Dataset names may contain letters, digits, underscores, and hyphens. HTTPS certificates are verified; Vite uses Node's trusted CAs (`NODE_EXTRA_CA_CERTS` can supply an institutional CA).

```sh
npm run build
npm run lint
npm test
```

Lint is read-only. Unit and Vue component tests cover RDF serialization, shape validation, list handling, defaults, copying, and machine forms.

## Deploy the UI against an existing Fuseki

The standalone deployment runs only nginx and the built UI. It does not start Fuseki, create a dataset, seed, migrate, or clear data. It assumes an unauthenticated Fuseki dataset and HTTP UI access over a private network or VPN. The dataset's default graph must already contain the current reference models, equipment, SHACL shapes, and application records. The UI supports writes; restrict access to both the UI and Fuseki through the private network and firewall.

On the server, check out the desired revision, install Docker with Compose, and copy `.env.deploy.example` to `.env.deploy.local`. Set the existing Fuseki base URL, dataset name, and the server's private/VPN interface IP. The UI container must be able to resolve and reach that URL; `localhost` inside a container refers to that container. Open only the selected UI port to the intended private network or VPN clients. Do not bind this deployment to `0.0.0.0` or a public interface.

```sh
docker compose -p vpd-deploy --env-file .env.deploy.local -f docker-compose.deploy.yml config --quiet
docker compose -p vpd-deploy --env-file .env.deploy.local -f docker-compose.deploy.yml up -d --build
docker compose -p vpd-deploy --env-file .env.deploy.local -f docker-compose.deploy.yml logs --tail 50 ui
```

The Compose file requires all three connection/binding settings and passes no backend credentials. Missing or invalid backend settings fail startup. Open `http://<private-server-ip>:8080` (or the configured `UI_PORT`). To update, check out the new revision and repeat the `up -d --build` command. To change only the backend settings, edit `.env.deploy.local` and run the same command without `--build`; the existing image is reused. The frontend never needs a backend URL at build time.

For a read-only connectivity check, substitute the private UI origin below:

```sh
curl --fail-with-body -H 'Accept: application/sparql-results+json' \
  --data-urlencode 'query=ASK { ?s ?p ?o }' http://10.0.0.10:8080/sparql
```

A `true` result confirms a nonempty default graph. Then open the UI and verify that equipment, process definitions, and SHACL-backed preparation load correctly using the [manual verification guide](data/docs/ui-verification.md). Do not test writes or run the integration suite against production data. Inspect any synthetic `dcat:downloadURL` values pointing to `localhost:8080`; arrange an explicit metadata correction to the deployed UI origin if those downloads are needed. Deployment does not rewrite stored URLs.

For troubleshooting, inspect the UI container logs and test DNS/routing from its Docker network. A 502 generally points to upstream connectivity, a wrong URL, or TLS trust; 401/403 points to backend access rules; an empty overview can indicate the wrong dataset/default graph or missing reference data. HTTPS upstreams use SNI and verify certificates against `/etc/ssl/certs/ca-certificates.crt`. For an institutional CA, mount a complete trusted CA bundle including that CA at this path. Do not disable certificate verification. The UI itself uses HTTP on its private interface; an existing HTTPS reverse proxy can be added separately if required.

## Laminate QR labels

Open a saved laminate and choose **Generate QR code**, then **Download SVG** (scalable for printing) or **Download PNG** (at least 1024 pixels). Both encode the exact RDF identity, including `#it`, for example `http://purl.org/for/laminate/1#it`. Generation is local to the browser and does not change the record.

Before attaching labels, configure and verify a single partial redirect in [PURL administration](https://purl.archive.org/). Under the `for` domain, use:

| Setting | Value |
| --- | --- |
| Name / source prefix | `/for/laminate/` |
| Type | `partial` |
| Target | `<deployed UI base URL>/id/laminate/` |

Replace the target placeholder with the actual deployed UI address, including its port if necessary, and preserve the trailing slash. For example, a UI at `http://10.0.0.10:8080` needs target `http://10.0.0.10:8080/id/laminate/`. Do not include an individual ID, `#it`, or a query string in this prefix rule. [PURL help](https://purl.archive.org/help) describes partial prefix matching. Check for existing exact or longer-prefix rules that could override this mapping. Newly generated UUID identities then work without individual PURL registrations. This configuration is performed separately by the namespace owner; the application does not create or update PURL rules.

For example, `http://purl.org/for/laminate/1#it` redirects to `https://ui.example.org/id/laminate/1#it`, which opens `/laminate?uri=http%3A%2F%2Fpurl.org%2Ffor%2Flaminate%2F1%23it`. The fragment is not sent in HTTP requests; the UI entry route reconstructs the complete identity. The existing nginx SPA fallback supports direct entry and refresh.

Verify both an example laminate and a newly created laminate from the scanning device before printing labels. If the UI moves, update this one PURL target; keep the printed RDF identities unchanged. The destination UI must be available and accessible to scanners, including VPN access where required. QR generation does not check whether the PURL redirect is configured. It also works in local development, but scanning still uses the configured PURL destination, not localhost.

This version resolves to the UI only. A future server endpoint behind the same PURL redirect can negotiate on `Accept`, directing browsers to the UI and serving `text/turtle` to RDF clients without changing labels. No RDF publishing endpoint or content negotiation is added here.

### Test the UI route without configuring PURL

1. Start the UI with a backend containing the laminate you want to test. For the supplied example, the RDF URI is `http://purl.org/for/laminate/1#it`.
2. Open `http://127.0.0.1:5173/id/laminate/1` in a browser for local development. Use port `5174` for remote development, `http://localhost:8080/id/laminate/1` for the default Docker stack, or the deployed UI's address.
3. Confirm the address changes to `/laminate?uri=http%3A%2F%2Fpurl.org%2Ffor%2Flaminate%2F1%23it` on that same UI host, and the expected laminate properties and production runs appear. The browser may display some query characters unescaped; the decoded `uri` must be exactly `http://purl.org/for/laminate/1#it`.
4. Repeat with `/id/laminate/1#it`, then refresh the resulting page. Both entry URLs must open the same laminate.
5. For a newly created laminate, replace `1` with the URI's path ID (typically a UUID), not its editable identifier or display name. Compare the destination with the detail page reached from the Laminates list.
6. Open `/id/laminate/unknown-test-id`. It must route to that identity and show “Laminate not found.” It must not substitute another laminate.

This is a client-side Vue Router redirect after the SPA loads, not an HTTP redirect from nginx. A `curl` request to the UI entry route returns the SPA HTML and does not exercise this navigation. These checks require no PURL changes and do not write application data.

### Test the complete PURL redirect

After configuring the prefix rule, open `http://purl.org/for/laminate/1#it` in a browser that can reach the deployed UI. Confirm it reaches the same record as the direct UI route above. Repeat with a newly created laminate, then scan both downloaded QR formats. The PURL target must point to a UI using the dataset containing those identities. If direct UI entry works but the PURL URL does not, inspect the PURL rule and its target address; if the UI opens but shows a missing record, check the ID and selected backend dataset.

## Verify the triple-store contract

The integration suite creates a uniquely named dataset on an isolated Fuseki instance and removes that dataset afterwards. It does not use the application's `vpd` dataset.

```sh
docker compose -p vpd-tests -f docker-compose.test.yml up -d
npm run test:integration
docker compose -p vpd-tests -f docker-compose.test.yml down
```

The test Fuseki listens on localhost:3330. Set `FUSEKI_URL` to use another test instance and `ADMIN_PASSWORD` if needed.

Tests compare the UI's generated RDF with the supplied initialization snapshot and plans using RDF dataset canonicalization, independently query the resulting triples, verify retry safety, execute shop-floor templates that create atomic instances with independent used plans and observation datasets, and check provenance-aware discovery.

Browser end-to-end testing is intentionally left to the user. See [the competency coverage and manual checks](data/docs/ui-verification.md).

## Model and implementation

The authoritative model is under [data](data), including the parameter shapes, material shapes, example snapshots, and SPARQL templates. Seeding uses an explicit file list so alternative snapshots and older models are not loaded together.

- A run selects its laminate through `for:workflowInitialization/for:laminate`.
- UI-created laminates use `laminate/{id}#it`, with stable child fragments such as `#layup`, `#tape-0`, and `#length`. Ordered list cells also have stable fragments, such as `#tape-stack-list-0` and `#position-0-list-0`. Copies receive a fresh laminate ID. Edits replace exclusively owned resources; shared resources that would be overwritten require creating a copy. Existing records are not automatically migrated.
- Initialization creates one initialized workflow, five initialized composite activity instances, and three fresh parameter plans. The shop-floor system creates atomic activity instances; all 43 activities remain in the process definition.
- Planned settings belong to the run's `for:workflowInitialization/for:parameterization/prov:hadMember` collection, retaining quantities, units, component references, and ordered RDF lists.
- The shop-floor system creates atomic executions and independently records their used settings through `prov:qualifiedAssociation/prov:hadPlan`, alongside the association's equipment. Execution plans can be named or anonymous, and can differ from planned settings. No activity initialization links are required.
- Upper and lower mold temperatures are the press temperature settings; redundant heater targets are omitted from new drafts and writes. Older session drafts retain their other inputs when restored.
- Run parameters and process details show recorded used settings separately from planned settings. Missing used values remain explicit. Copying a run uses its planned settings only.
- Datasets link to generating observations through `prov:wasGeneratedBy`; observations supply sensor, measured property, feature of interest, and workflow membership.
- Specified settings and expected sensor configuration are distinct from recorded execution facts.
- Initialization writes no execution times, completed states, output-part assumptions, or observations.

Source layout:

| Directory             | Responsibility                                                         |
| --------------------- | ---------------------------------------------------------------------- |
| `src/domain`          | RDF terms, list traversal, workflow structure, initialization contract |
| `src/services`        | SPARQL repositories, filtering, pagination, guarded writes             |
| `src/stores`          | Cached reference data and explicit refresh                             |
| `src/components`      | Machine forms, context links, recursive metadata and process views     |
| `src/views`           | Overview, browsing, entity detail, run preparation                     |
| `scripts/seed.ts`     | Validated, non-destructive startup seeding                             |
| `data/catalog.ttl`    | Standalone and connected dataset metadata                              |
| `public/example-data` | Synthetic downloadable example files                                   |
| `tests`               | Unit, component, and real-Fuseki integration tests                     |

The UI retains no legacy workflow, equipment, activity, or dataset authoring editors. Saved runs are read-only; copy their settings to prepare another run.
