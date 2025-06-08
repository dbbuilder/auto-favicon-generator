const fs = require('fs');
const path = require('path');

async function build() {
    try {
        console.log('🔧 Building Auto Favicon Generator...');
        
        // Check if terser is available
        let terser;
        try {
            terser = require('terser');
        } catch (error) {
            console.log('⚠️  Terser not found. Installing dependencies...');
            const { execSync } = require('child_process');
            execSync('npm install', { stdio: 'inherit' });
            terser = require('terser');
        }
        
        // Read source file
        console.log('📖 Reading source file...');
        const sourcePath = path.join(__dirname, 'src', 'favicon-generator.js');
        const source = fs.readFileSync(sourcePath, 'utf8');
        
        console.log(`📊 Source file: ${source.length} characters, ${source.split('\n').length} lines`);
        
        // Minify with terser
        console.log('🗜️  Minifying with Terser...');
        const minified = await terser.minify(source, {
            compress: {
                drop_console: false, // Keep console.error for debugging
                drop_debugger: true,
                dead_code: true,
                unused: true
            },
            mangle: {
                toplevel: false, // Don't mangle top-level names
                reserved: ['FaviconGenerator', 'autoFavicon', 'createFaviconGenerator'] // Preserve public API
            },
            format: {
                comments: false,
                beautify: false
            }
        });
        
        if (minified.error) {
            throw minified.error;
        }
        
        // Write minified version
        const distPath = path.join(__dirname, 'dist');
        if (!fs.existsSync(distPath)) {
            fs.mkdirSync(distPath, { recursive: true });
        }
        
        const minifiedPath = path.join(distPath, 'favicon-generator.min.js');
        fs.writeFileSync(minifiedPath, minified.code);
        
        // Create UMD version (same as source for now)
        const umdPath = path.join(distPath, 'favicon-generator.umd.js');
        fs.writeFileSync(umdPath, source);
        
        // Calculate size reduction
        const originalSize = source.length;
        const minifiedSize = minified.code.length;
        const reduction = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
        
        console.log('✅ Build completed successfully!');
        console.log(`📊 Size reduction: ${originalSize} → ${minifiedSize} bytes (${reduction}% smaller)`);
        console.log(`📁 Output files:`);
        console.log(`   - ${minifiedPath}`);
        console.log(`   - ${umdPath}`);
        
    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

// Run build if called directly
if (require.main === module) {
    build();
}

module.exports = build;
