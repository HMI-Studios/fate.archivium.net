Type declarations for the parts of the `archivium` dependency this app imports.

TypeScript is pointed here (tsconfig.app.json `paths`) instead of Archivium's own
sources, which pull in its server code and don't pass this app's stricter settings.
Webpack still bundles the real files. Keep these in step with Archivium when the
pinned commit in package.json changes.
