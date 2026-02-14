# Third-Party Notices Policy

This product is distributed as a closed-source/proprietary application and may integrate third-party open-source components.

## Allowed Licenses (default policy)

- MIT
- Apache-2.0
- BSD (2-Clause/3-Clause)
- CC0

## Restricted / Disallowed by Default

- GPL (any version)
- AGPL (any version)

GPL/AGPL dependencies are not allowed unless explicitly reviewed and approved by legal/business owners for a specific use case.

## How to Use This Folder

- `THIRD_PARTY_LICENSES.txt`: high-level inventory of key runtime components and their licenses.
- `NOTICE.txt`: Apache-style notice placeholders when required by bundled dependencies.

## Verification

Run:

```bash
npm run licenses:check
```

This script performs a best-effort scan of dependency metadata and prints warnings for GPL/AGPL findings or unresolved package metadata.
