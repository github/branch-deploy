# Maintainer Guide 🧑‍🔬

This project is distributed as the action metadata plus the committed ES module bundle in `dist/`; it is not released as an npm library.

## Release Process 🏷️

`src/version.ts` is the release version source. Only stable `vMAJOR.MINOR.PATCH` versions are released.

To prepare a release:

1. Update `src/version.ts` to the next stable version.
2. Install the locked dependencies, run the complete project check, and regenerate the committed action bundle:

   ```bash
   npm ci --ignore-scripts --no-audit --no-fund
   npm run all
   npm run acceptance
   ```

3. Commit the version and `dist/` changes in a pull request.
4. Merge the reviewed pull request to protected `main` after CI passes.

The release workflow then rebuilds the project, verifies the committed bundle, and creates build-provenance attestations for `action.yml` and every file in `dist/`. After those attestations verify, it creates an assetless immutable GitHub Release, verifies the release, and moves the matching major tag such as `v12` to the new exact release tag. For `v12.x.x` releases, the workflow prepends a short migration note and upgrade-guide link before the generated release notes.

Transient failures can be retried from the original workflow run. A matching exact tag or release is reused only when it targets the same source commit. If the workflow itself must change, merge the fix and release the next stable version.

Verify an immutable release with:

```bash
gh release verify v12.0.0 --repo github/branch-deploy
```

Verify a downloaded action file with:

```bash
gh attestation verify dist/index.js \
  --repo github/branch-deploy \
  --signer-workflow github/branch-deploy/.github/workflows/release.yml
```

The direct file attestations provide build provenance, while the immutable release attestation binds the exact annotated tag to its source commit. This single-workflow design is intentionally not described as SLSA Build Level 3 because it does not use an isolated reusable build boundary.
