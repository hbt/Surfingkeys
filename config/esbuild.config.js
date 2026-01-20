const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const package = require('../package.json');
const { copy } = require('esbuild-plugin-copy');

function modifyManifest(browser, mode, manifestPath, outputPath) {
    const content = fs.readFileSync(manifestPath, 'utf8');
    let manifest = JSON.parse(content);

    // Inject version from package.json
    manifest.version = package.version;

    if (browser === "firefox") {
        manifest.options_ui = {
            page: "pages/options.html"
        };
        manifest.permissions.push("cookies");
        manifest.permissions.push("contextualIdentities");
        manifest.permissions.push("<all_urls>");
    } else if (browser === "safari") {
        manifest.incognito = "split";
        manifest.options_page = "pages/options.html";
        manifest.permissions.push("<all_urls>");
        manifest.background.persistent = false;
    } else {
        // chromium family
        manifest.manifest_version = 3;
        manifest.permissions.push("proxy");
        manifest.permissions.push("tts");
        manifest.permissions.push("downloads.shelf");
        manifest.permissions.push("favicon");
        manifest.permissions.push("userScripts");
        manifest.permissions.push("tabGroups");
        manifest.incognito = "split";
        manifest.options_page = "pages/options.html";
        manifest.background = {
            "service_worker": "background.js"
        };
        manifest.host_permissions = [
            "<all_urls>"
        ];
        manifest.web_accessible_resources = [
            {
                "extension_ids": ["*"],
                "resources": [
                    "_favicon/*",
                    "api.js",
                    "pages/neovim.html",
                    "pages/emoji.tsv",
                    "pages/l10n.json",
                    "pages/frontend.html",
                    "pages/pdf_viewer.html",
                    "pages/pdf_viewer.css",
                    "pages/pdf_viewer.mjs",
                    "pages/shadow.css"
                ],
                "matches": [
                    "<all_urls>"
                ]
            }
        ];
        manifest.action = manifest.browser_action;
        delete manifest.browser_action;
        delete manifest.content_security_policy;

        if (mode === "development") {
            manifest.key = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAneIRqYRqG/0RoYzpWoyeeO8KxxvWZvIabABbeQyHQ2PFOf81j/O5J28HGAEQJ56AptKMTcTeG2qZga9B2u9k98OmRcGp8BDco6fh1vD6/x0fWfehPeub5IcEcQmCd1lBuVa8AtUqV3C+He5rS4g8dB8g8GRlSPPSiDSVNMv+iwKAk7TbM3TKz6DyFO8eCtWXr6wJCcYeJA+Mub7o8DKIHKgv8XH8+GbJGjeeIUBU7mlGlyS7ivdsG1V6D2/Ldx0O1e6sRn7f9jiC4Xy1N+zgZ7BshYbnlbwedomg1d5kuo5m4rS+8BgTchPPkhkvEs62MI4e+fmQd0oGgs7PtMSrTwIDAQAb";
        }
    }

    // Write transformed manifest
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
}

async function build() {
    const mode = process.argv[2] || 'development';
    const isWatch = process.argv.includes('--watch');
    const browser = process.env.browser || 'chrome';
    const buildPath = path.resolve(__dirname, `../dist-esbuild/${mode}/${browser}`);

    console.log(`Building for ${browser} in ${mode} mode${isWatch ? ' (watch)' : ''}...`);
    console.log(`Output: ${buildPath}`);

    // Clean output directory
    if (fs.existsSync(buildPath)) {
        fs.rmSync(buildPath, { recursive: true });
    }
    fs.mkdirSync(buildPath, { recursive: true });

    // Define entry points
    const regularEntries = {
        'background': `./src/background/${browser}.js`,
        'content': `./src/content_scripts/${browser}.js`,
        'pages/frontend': `./src/content_scripts/ui/frontend.js`,
        'pages/start': './src/content_scripts/start.js',
        'pages/ace': './src/content_scripts/ace.js',
    };

    const moduleEntries = {
        'pages/options': './src/content_scripts/options.js',
    };

    if (browser !== 'safari') {
        regularEntries['pages/markdown'] = './src/content_scripts/markdown.js';
    }

    if (browser === 'chrome') {
        regularEntries['pages/neovim'] = './src/pages/neovim.js';
        moduleEntries['pages/neovim_lib'] = './src/nvim/renderer.ts';
        moduleEntries['api'] = './src/user_scripts/index.js';
    }

    // Copy static assets
    const copyPatterns = [
        { from: 'src/pages', to: buildPath + '/pages', recursive: true },
        { from: 'src/content_scripts/ui/frontend.html', to: buildPath + '/pages/frontend.html' },
        { from: 'src/content_scripts/ui/frontend.css', to: buildPath + '/pages/frontend.css' },
        { from: 'node_modules/ace-builds/src-noconflict/worker-javascript.js', to: buildPath + '/pages/worker-javascript.js' },
        { from: 'src/icons', to: buildPath + '/icons', recursive: true },
        { from: 'src/content_scripts/content.css', to: buildPath + '/content.css' },
    ];

    if (browser === 'chrome') {
        copyPatterns.push(
            { from: 'node_modules/pdfjs-dist/cmaps', to: buildPath + '/pages/cmaps', recursive: true },
            { from: 'node_modules/pdfjs-dist/build/pdf.min.mjs', to: buildPath + '/pages/pdf.min.mjs' },
            { from: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs', to: buildPath + '/pages/pdf.worker.min.mjs' }
        );
    }

    // Manual copy function
    function copyFiles() {
        for (const pattern of copyPatterns) {
            const from = pattern.from;
            const to = pattern.to;

            if (!fs.existsSync(from)) {
                console.warn(`Warning: Source not found: ${from}`);
                continue;
            }

            const stat = fs.statSync(from);
            if (stat.isDirectory()) {
                if (pattern.recursive) {
                    fs.mkdirSync(to, { recursive: true });
                    fs.cpSync(from, to, { recursive: true, force: true });
                }
            } else if (stat.isFile()) {
                fs.mkdirSync(path.dirname(to), { recursive: true });
                fs.copyFileSync(from, to);
            }
        }
    }

    copyFiles();

    // Transform and write manifest
    modifyManifest(
        browser,
        mode,
        './src/manifest.json',
        path.join(buildPath, 'manifest.json')
    );

    const startTime = Date.now();

    // Common build options for regular bundles
    const regularOptions = {
        entryPoints: regularEntries,
        bundle: true,
        outdir: buildPath,
        platform: 'browser',
        target: 'es2020',
        format: 'iife',
        minify: mode === 'production',
        sourcemap: false,
        loader: {
            '.ts': 'ts',
            '.js': 'js',
        },
        external: ['./neovim_lib.js', './pages/options.js', './ace.js'],
        logLevel: 'info',
    };

    // Common build options for ES module bundles
    const moduleOptions = {
        entryPoints: moduleEntries,
        bundle: true,
        outdir: buildPath,
        platform: 'browser',
        target: 'es2020',
        format: 'esm',
        minify: mode === 'production',
        sourcemap: false,
        loader: {
            '.ts': 'ts',
            '.js': 'js',
        },
        logLevel: 'info',
    };

    try {
        if (isWatch) {
            // Use context API for watch mode
            console.log('\n=== Starting watch mode ===');

            const regularContext = await esbuild.context(regularOptions);
            const moduleContext = await esbuild.context(moduleOptions);

            await regularContext.watch();
            await moduleContext.watch();

            console.log('👀 Watching for changes...\n');

            // Keep process alive
            await new Promise(() => {});
        } else {
            // One-time build
            console.log('\n=== Building regular bundles ===');
            await esbuild.build(regularOptions);

            console.log('\n=== Building ES module bundles ===');
            await esbuild.build(moduleOptions);

            const endTime = Date.now();
            console.log(`\n✅ Build completed in ${endTime - startTime}ms`);
            console.log(`📦 Output: ${buildPath}`);
        }

    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

build();
