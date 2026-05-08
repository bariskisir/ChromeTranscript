/** Build script that bundles every Chrome extension entry point. */
import { build } from 'vite';
import { createExtensionBuildConfig, EXTENSION_ENTRIES } from '../vite.config.mjs';

const watch = process.argv.includes('--watch');

/** Builds every extension entrypoint sequentially so static assets are copied first. */
async function run() {
  for (const entry of EXTENSION_ENTRIES) {
    await build(createExtensionBuildConfig({ ...entry, watch }));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
