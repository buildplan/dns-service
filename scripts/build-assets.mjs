import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const allowSkip = process.argv.includes('--if-available');

function resolveOrSkip(specifier) {
    try {
        return require.resolve(specifier, { paths: [rootDir] });
    } catch (err) {
        if (allowSkip) return null;
        throw err;
    }
}

function main() {
    const tailwindCli = resolveOrSkip('tailwindcss/lib/cli.js');
    const maplibrePkgPath = resolveOrSkip('maplibre-gl/package.json');
    const interPkgPath = resolveOrSkip('@fontsource-variable/inter/package.json');

    if (!tailwindCli || !maplibrePkgPath || !interPkgPath) {
        console.log('Skipping asset build (build-time devDependencies not installed).');
        return;
    }

    const assetsDir = path.join(rootDir, 'views', 'assets');
    const jsOutDir = path.join(assetsDir, 'js');
    const fontsDir = path.join(assetsDir, 'fonts');
    const maplibreOutDir = path.join(assetsDir, 'vendor', 'maplibre-gl');

    fs.mkdirSync(jsOutDir, { recursive: true });
    fs.mkdirSync(fontsDir, { recursive: true });
    fs.mkdirSync(maplibreOutDir, { recursive: true });

    const srcJsDir = path.join(rootDir, 'src', 'js');
    for (const file of fs.readdirSync(srcJsDir)) {
        if (file.endsWith('.js')) {
            fs.copyFileSync(path.join(srcJsDir, file), path.join(jsOutDir, file));
        }
    }

    const maplibreDist = path.join(path.dirname(maplibrePkgPath), 'dist');
    for (const file of ['maplibre-gl.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css']) {
        const srcPath = path.join(maplibreDist, file);
        const destPath = path.join(maplibreOutDir, file);
        if (file.endsWith('.mjs')) {
            // Avoid DevTools fetching omitted .map files from the Express catch-all route.
            const source = fs.readFileSync(srcPath, 'utf8').replace(/\n\/\/# sourceMappingURL=[^\n]*\s*$/, '\n');
            fs.writeFileSync(destPath, source);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }

    const interFiles = path.join(path.dirname(interPkgPath), 'files');
    for (const file of ['inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2']) {
        fs.copyFileSync(path.join(interFiles, file), path.join(fontsDir, file));
    }

    execFileSync(
        process.execPath,
        [
            tailwindCli,
            '-c', path.join(rootDir, 'tailwind.config.js'),
            '-i', path.join(rootDir, 'src', 'css', 'styles.css'),
            '-o', path.join(assetsDir, 'app.css'),
            '--minify',
        ],
        { cwd: rootDir, stdio: 'inherit' }
    );
}

main();
