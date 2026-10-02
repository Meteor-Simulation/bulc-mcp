# Notice

## What this package contains

- The source code of this MCP server (MIT, see `LICENSE`).
- A knowledge pack (`knowledge/`), prompts (`prompts/`) and synthetic examples (`examples/`), also under MIT.
- `src/tools-snapshot.json`: the names, descriptions and input schemas of the BULC app's tools, so that clients can list them
  while the app is not running. It contains no implementation.

It does **not** contain the BULC desktop application, its solvers or any of their source code. BULC is commercial software
licensed separately by Meteor Simulation Inc.

## Sources cited by the knowledge pack

| Source | Status | How it is used |
|---|---|---|
| NIST Fire Dynamics Simulator 6.10.1 — User's Guide and the public FDS 6.10.1 source (input reader) | Work of the US Government, not subject to copyright in the United States | Key names, units, default values and input error numbers in `knowledge/fds-6.10.1/keys.yaml`; formulas such as the characteristic fire diameter D* |
| Korean fire-safety technical standards (NFTC 103, NFTC 501) | Public notices of the Korean government | Clause-level hints, always marked `regulatory_verify` ("check against the current text") |
| NFPA 13, NFPA 20, SOLAS / FSS Code, IGC Code | Copyrighted standards and conventions | Only clause numbers and widely known relations are mentioned; no text is reproduced. Always marked `regulatory_verify` |
| SFPE Handbook values (e.g. radiative fractions, t² growth coefficients) | Published engineering data | Well-known numeric values cited as guidance |

Rules marked `regulatory_verify` are hints, not legal requirements. Always confirm them against the edition in force and the
authority having jurisdiction.

## Trademarks

"BULC" and "BUL:C" are trademarks of Meteor Simulation Inc. The MIT licence of this repository covers the code and documents in
it and grants no right to use these marks. Other names (FDS, Smokeview, NFPA, Claude, Cursor, Visual Studio Code …) belong to their
respective owners and are used only to describe compatibility.

## Third-party packages

Runtime dependency: `@modelcontextprotocol/sdk` (MIT) and its MIT/ISC/BSD-licensed dependencies. Development dependencies:
`typescript` (Apache-2.0), `@types/node` (MIT), `yaml` (ISC). `npm run check:licenses` fails the build if a GPL, AGPL, LGPL, SSPL
or similar licence appears in the dependency tree.
