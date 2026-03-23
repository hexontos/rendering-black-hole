// esbuild.config.mjs
import * as esbuild from 'esbuild';

// Check if watch mode is requested
const isWatch = process.argv.includes('--watch');

if (isWatch) {
    // Watch mode - use context()
    const ctx = await esbuild.context({
        entryPoints: ['./src/demo_to_try_3d.ts'],
        bundle: true,
        outfile: './dist/bundle.js',
        platform: 'browser',
        target: 'es2020',
        sourcemap: true,
        minify: false,
    });
    
    await ctx.watch();
    console.log('👀 Watching for changes...');
} else {
    // Build mode
    await esbuild.build({
        entryPoints: ['./src/demo_to_try_3d.ts'],
        bundle: true,
        outfile: './dist/bundle.js',
        platform: 'browser',
        target: 'es2020',
        sourcemap: true,
        minify: false,
    });
    console.log('✅ Build complete!');
}
