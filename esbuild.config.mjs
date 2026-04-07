// esbuild.config.mjs
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const entryPoint = path.join(here, 'src', 'main.ts');
const outfile = path.join(here, 'dist', 'bundle.js');

// Check if watch mode is requested
const isWatch = process.argv.includes('--watch');

if (isWatch) {
    // Watch mode - use context()
    const ctx = await esbuild.context({
        entryPoints: [entryPoint],
        bundle: true,
        outfile,
        platform: 'browser',
        target: 'es2020',
        loader: {
            '.wgsl': 'text',
        },
        sourcemap: true,
        minify: false,
    });
    
    await ctx.watch();
    console.log('👀 Watching for changes...');
} else {
    // Build mode
    await esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        outfile,
        platform: 'browser',
        target: 'es2020',
        loader: {
            '.wgsl': 'text',
        },
        sourcemap: true,
        minify: false,
    });
    console.log('✅ Build complete!');
}
