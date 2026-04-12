// esbuild.config.mjs
import * as esbuild from 'esbuild';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const entryPoint = path.join(here, 'src', 'main.ts');
const outfile = path.join(here, 'dist', 'bundle.js');
const htmlSource = path.join(here, 'index.html');
const htmlOutfile = path.join(here, 'dist', 'index.html');

const copyHtmlEntryPoint = async () => {
    const html = await fs.readFile(htmlSource, 'utf8');
    const pagesHtml = html.replace('./dist/bundle.js', './bundle.js');

    await fs.mkdir(path.dirname(htmlOutfile), { recursive: true });
    await fs.writeFile(htmlOutfile, pagesHtml);
};

const buildSite = async () => {
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

    await copyHtmlEntryPoint();
};

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
    await copyHtmlEntryPoint();
    console.log('👀 Watching for changes...');
} else {
    // Build mode
    await buildSite();
    console.log('✅ Build complete!');
}
