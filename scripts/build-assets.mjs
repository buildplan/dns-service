import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/** Recursively collect file paths under `dir` matching `predicate`. */
function walkFiles(dir, predicate, results = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkFiles(fullPath, predicate, results);
        } else if (predicate(fullPath, entry.name)) {
            results.push(fullPath);
        }
    }
    return results;
}

/** Add whitespace-delimited candidate class tokens from `chunk`. */
function addTokensFromChunk(chunk, candidates) {
    for (const token of chunk.trim().split(/\s+/)) {
        if (token) candidates.add(token);
    }
}

/** Extract static and template-literal class candidates from JS source. */
function extractJsCandidates(source, candidates) {
    const stringRe = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
    for (const match of source.matchAll(stringRe)) {
        const [, quote, body] = match;
        if (quote !== '`') {
            addTokensFromChunk(body, candidates);
            continue;
        }
        // Split template literals at interpolations so static class chunks and nested string literals are both captured.
        let cursor = 0;
        let idx;
        while ((idx = body.indexOf('${', cursor)) !== -1) {
            addTokensFromChunk(body.slice(cursor, idx), candidates);
            let depth = 1;
            let end = idx + 2;
            while (end < body.length && depth > 0) {
                if (body[end] === '{') depth++;
                else if (body[end] === '}') depth--;
                end++;
            }
            extractJsCandidates(body.slice(idx + 2, depth === 0 ? end - 1 : end), candidates);
            cursor = end;
        }
        addTokensFromChunk(body.slice(cursor), candidates);
    }
}

/** Gather candidate class names across HTML views and client JS sources. */
function collectCandidates(viewsDir, assetsDir, srcJsDir) {
    const candidates = new Set();

    const htmlFiles = walkFiles(
        viewsDir,
        (fullPath, name) => !fullPath.startsWith(assetsDir + path.sep) && name.endsWith('.html')
    );
    for (const file of htmlFiles) {
        const html = fs.readFileSync(file, 'utf8');
        for (const match of html.matchAll(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
            addTokensFromChunk(match[1] ?? match[2] ?? '', candidates);
        }
    }

    const jsFiles = walkFiles(srcJsDir, (_fullPath, name) => name.endsWith('.js') || name.endsWith('.mjs'));
    for (const file of jsFiles) {
        extractJsCandidates(fs.readFileSync(file, 'utf8'), candidates);
    }

    return [...candidates];
}

/** Compile CSS via Tailwind CSS v4's pure-JS compiler API (avoids native CLI binaries on multi-arch Alpine). */
async function buildTailwindCss(tailwindPkgPath, inputPath, outputPath, candidates) {
    const tailwindDir = path.dirname(tailwindPkgPath);
    const tailwindEntry = path.join(tailwindDir, 'dist', 'lib.mjs');
    const { compile } = await import(pathToFileURL(tailwindEntry).href);

    const inputCss = fs.readFileSync(inputPath, 'utf8');
    const compiler = await compile(inputCss, {
        base: path.dirname(inputPath),
        from: inputPath,
        loadStylesheet: async (id, base) => {
            if (id === 'tailwindcss') {
                const entry = path.join(tailwindDir, 'index.css');
                return { path: entry, base: tailwindDir, content: fs.readFileSync(entry, 'utf8') };
            }
            if (id.startsWith('tailwindcss/')) {
                const sub = id.slice('tailwindcss/'.length);
                const file = sub.endsWith('.css') ? sub : `${sub}.css`;
                const resolved = path.join(tailwindDir, file);
                return { path: resolved, base: path.dirname(resolved), content: fs.readFileSync(resolved, 'utf8') };
            }
            const file = id.endsWith('.css') ? id : `${id}.css`;
            const resolved = path.resolve(base, file);
            return { path: resolved, base: path.dirname(resolved), content: fs.readFileSync(resolved, 'utf8') };
        },
    });

    const compiledCss = compiler.build(candidates);
    fs.writeFileSync(outputPath, compiledCss);
}

async function main() {
    const tailwindPkgPath = resolveOrSkip('tailwindcss/package.json');
    const maplibrePkgPath = resolveOrSkip('maplibre-gl/package.json');
    const interPkgPath = resolveOrSkip('@fontsource-variable/inter/package.json');

    if (!tailwindPkgPath || !maplibrePkgPath || !interPkgPath) {
        console.log('Skipping asset build (build-time devDependencies not installed).');
        return;
    }

    const viewsDir = path.join(rootDir, 'views');
    const assetsDir = path.join(viewsDir, 'assets');
    const srcJsDir = path.join(rootDir, 'src', 'js');
    const jsOutDir = path.join(assetsDir, 'js');
    const fontsDir = path.join(assetsDir, 'fonts');
    const maplibreOutDir = path.join(assetsDir, 'vendor', 'maplibre-gl');

    fs.mkdirSync(jsOutDir, { recursive: true });
    fs.mkdirSync(fontsDir, { recursive: true });
    fs.mkdirSync(maplibreOutDir, { recursive: true });

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

    const start = performance.now();
    const candidates = collectCandidates(viewsDir, assetsDir, srcJsDir);
    await buildTailwindCss(
        tailwindPkgPath,
        path.join(rootDir, 'src', 'css', 'styles.css'),
        path.join(assetsDir, 'app.css'),
        candidates
    );
    const elapsedMs = Math.round(performance.now() - start);
    console.log(`Built Tailwind CSS v4 assets in ${elapsedMs}ms (${candidates.length} candidates).`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
