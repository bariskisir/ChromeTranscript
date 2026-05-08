/** Vite build configuration and static asset copy plugin for the Chrome extension. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { defineConfig } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');

export const EXTENSION_ENTRIES = [
  { name: 'background', entry: 'src/background/index.ts', fileName: 'background.js', globalName: 'ChromeTranscriptBackground' },
  { name: 'offscreen', entry: 'src/ui/offscreen/index.ts', fileName: 'offscreen.js', globalName: 'ChromeTranscriptOffscreen' },
  { name: 'popup', entry: 'src/ui/popup/index.ts', fileName: 'popup.js', globalName: 'ChromeTranscriptPopup' },
  { name: 'sidepanel', entry: 'src/ui/sidePanel/index.ts', fileName: 'sidepanel.js', globalName: 'ChromeTranscriptSidePanel' }
];

/** Copies one static source file into the extension dist directory. */
async function copyFileTask(from, to) {
  const source = path.resolve(ROOT_DIR, from);
  const target = path.resolve(DIST_DIR, to);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

/** Copies manifest, HTML, CSS, icons, and worklet assets needed by the extension. */
async function copyStaticAssets() {
  await Promise.all([
    copyFileTask('public/manifest.json', 'manifest.json'),
    copyFileTask('public/offscreen.html', 'offscreen.html'),
    copyFileTask('public/audio-worklet.js', 'audio-worklet.js'),
    copyFileTask('public/popup.html', 'popup.html'),
    copyFileTask('public/sidepanel.html', 'sidepanel.html'),
    copyFileTask('public/styles.css', 'styles.css'),
    copyFileTask('public/icons/chrome-transcript.png', 'icons/chrome-transcript.png')
  ]);
}

/** Creates a Vite plugin that copies static assets before each build. */
function copyStaticAssetsPlugin() {
  return {
    name: 'copy-static-assets',
    /** Runs before Vite starts bundling an extension entry point. */
    async buildStart() {
      await copyStaticAssets();
    }
  };
}

/** Creates the Vite build config for one extension entry point. */
export function createExtensionBuildConfig({ entry, fileName, globalName, watch = false }) {
  return defineConfig({
    build: {
      outDir: DIST_DIR,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      reportCompressedSize: false,
      watch: watch ? {} : undefined,
      target: 'chrome120',
      lib: {
        entry: path.resolve(ROOT_DIR, entry),
        name: globalName,
        formats: ['iife'],
        fileName: () => fileName
      },
      rolldownOptions: {
        transform: {
          define: {
            'import.meta': '{}'
          }
        }
      }
    },
    plugins: [copyStaticAssetsPlugin()]
  });
}

export default createExtensionBuildConfig(EXTENSION_ENTRIES[0]);
