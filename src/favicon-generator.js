/**
 * Auto Favicon Generator
 * Automatically generates favicon from page content and styling
 * 
 * @version 1.0.0
 * @author Your Name
 * @license MIT
 */

(function(global) {
    'use strict';

    /**
     * Configuration defaults
     */
    const DEFAULT_CONFIG = {
        autoInit: true,              // Auto-initialize on DOM ready
        size: 32,                    // Favicon size in pixels
        fallbackColor: '#2563eb',    // Default background color
        textColor: '#ffffff',        // Text color for initials
        fontFamily: 'Arial, sans-serif', // Font family for text
        enableShadow: true,          // Enable text shadow
        enableLogging: false,        // Enable console logging
        retryAttempts: 3,           // Retry attempts for failed operations
        timeout: 2000,              // Timeout for image processing (ms)
        enableCaching: true,         // Enable localStorage caching
        cacheExpiration: 7,          // Cache expiration in days
        respectExisting: true,       // Skip if favicon already exists
        forceRegenerate: false,      // Force regeneration even if cached
        checkImplicitFavicon: false  // Check for /favicon.ico (can cause 404 console errors)
    };

    /**
     * Main FaviconGenerator class
     */
    class FaviconGenerator {
        constructor(config = {}) {
            // Merge configuration with defaults
            this.config = { ...DEFAULT_CONFIG, ...config };
            
            // Initialize properties
            this.canvas = null;
            this.ctx = null;
            this.initialized = false;
            this.retryCount = 0;
            this.cacheKey = 'auto-favicon-cache';
            this.pageSignature = null;
            
            this.log('FaviconGenerator initialized with config:', this.config);
            
            // Auto-initialize if enabled
            if (this.config.autoInit) {
                this.init();
            }
        }

        /**
         * Initialize the favicon generator
         */
        init() {
            if (this.initialized) {
                this.log('FaviconGenerator already initialized');
                return Promise.resolve();
            }

            return new Promise((resolve, reject) => {
                try {
                    // Wait for DOM to be ready
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', () => {
                            this.checkAndGenerate().then(resolve).catch(reject);
                        });
                    } else {
                        this.checkAndGenerate().then(resolve).catch(reject);
                    }
                } catch (error) {
                    this.logError('Initialization error:', error);
                    reject(error);
                }
            });
        }

        /**
         * Check conditions and generate favicon if needed
         */
        async checkAndGenerate() {
            try {
                // Step 1: Check if favicon already exists (unless forced)
                if (this.config.respectExisting && !this.config.forceRegenerate) {
                    const existingFavicon = await this.detectExistingFavicon();
                    if (existingFavicon) {
                        this.log('Existing favicon detected, skipping generation:', existingFavicon);
                        this.initialized = true;
                        return null;
                    }
                }

                // Step 2: Generate page signature for caching
                this.pageSignature = this.generatePageSignature();
                this.log('Page signature generated:', this.pageSignature);

                // Step 3: Check cache if enabled
                if (this.config.enableCaching && !this.config.forceRegenerate) {
                    const cachedFavicon = this.getCachedFavicon();
                    if (cachedFavicon) {
                        this.log('Using cached favicon');
                        this.applyFavicon(cachedFavicon);
                        this.initialized = true;
                        return cachedFavicon;
                    }
                }

                // Step 4: Generate new favicon
                const result = await this.generate();
                
                // Step 5: Cache the result if enabled
                if (this.config.enableCaching && result) {
                    this.cacheFavicon(result);
                }

                return result;

            } catch (error) {
                this.logError('Error in checkAndGenerate:', error);
                throw error;
            }
        }

        /**
         * Detect if favicon already exists on the page
         */
        async detectExistingFavicon() {
            try {
                // Look for existing favicon elements
                const faviconSelectors = [
                    'link[rel="icon"]',
                    'link[rel="shortcut icon"]',
                    'link[rel="apple-touch-icon"]',
                    'link[rel="apple-touch-icon-precomposed"]',
                    'link[type="image/x-icon"]',
                    'link[type="image/vnd.microsoft.icon"]',
                    'link[type="image/png"]',
                    'link[type="image/gif"]',
                    'link[type="image/jpeg"]'
                ];

                for (const selector of faviconSelectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        // Skip auto-generated favicons
                        if (element.hasAttribute('data-auto-generated')) {
                            continue;
                        }

                        // Check if favicon has valid href
                        const href = element.getAttribute('href');
                        if (href && href.trim() !== '' && href !== '#') {
                            this.log(`Found existing favicon: ${selector} with href: ${href}`);
                            return {
                                element: element,
                                href: href,
                                type: element.getAttribute('type') || 'unknown'
                            };
                        }
                    }
                }

                // Check for favicon.ico in root (implicit favicon) if enabled
                if (this.config.checkImplicitFavicon) {
                    const hasImplicitFavicon = await this.checkImplicitFavicon();
                    if (hasImplicitFavicon) {
                        this.log('Found implicit favicon.ico');
                        return {
                            element: null,
                            href: '/favicon.ico',
                            type: 'implicit'
                        };
                    }
                }

                this.log('No existing favicon detected');
                return null;

            } catch (error) {
                this.logError('Error detecting existing favicon:', error);
                return null;
            }
        }

        /**
         * Check if implicit favicon.ico exists
         */
        async checkImplicitFavicon() {
            try {
                // Use fetch instead of Image to avoid console 404 errors
                const response = await fetch('/favicon.ico?' + Math.random(), {
                    method: 'HEAD', // Only check headers, don't download content
                    cache: 'no-cache'
                });
                return response.ok;
            } catch (error) {
                // Silently handle network errors (including 404s)
                return false;
            }
        }

        /**
         * Generate a unique signature for the current page
         */
        generatePageSignature() {
            try {
                // Collect page characteristics for signature
                const title = document.title || '';
                const url = window.location.href;
                const domain = window.location.hostname;
                
                // Get primary styling colors
                const bodyStyles = window.getComputedStyle(document.body);
                const bodyBgColor = bodyStyles.backgroundColor || '';
                const bodyTextColor = bodyStyles.color || '';
                
                // Check for logo elements
                const logoElements = document.querySelectorAll('img[src*="logo" i], .logo, #logo');
                const logoCount = logoElements.length;
                const logoSrcs = Array.from(logoElements)
                    .filter(el => el.tagName === 'IMG')
                    .map(el => el.src)
                    .slice(0, 3); // Limit to first 3 logo sources
                
                // Create signature object
                const signatureData = {
                    title: title.substring(0, 100), // Limit title length
                    domain: domain,
                    bodyBgColor: bodyBgColor,
                    bodyTextColor: bodyTextColor,
                    logoCount: logoCount,
                    logoSrcs: logoSrcs,
                    configHash: this.hashConfig(),
                    version: '1.0.0' // Module version for cache invalidation
                };

                // Generate hash from signature data
                const signatureString = JSON.stringify(signatureData);
                return this.simpleHash(signatureString);

            } catch (error) {
                this.logError('Error generating page signature:', error);
                // Fallback signature
                return this.simpleHash(document.title + window.location.hostname + Date.now());
            }
        }

        /**
         * Generate hash from configuration for cache invalidation
         */
        hashConfig() {
            try {
                const configForHash = {
                    size: this.config.size,
                    fallbackColor: this.config.fallbackColor,
                    textColor: this.config.textColor,
                    fontFamily: this.config.fontFamily,
                    enableShadow: this.config.enableShadow
                };
                return this.simpleHash(JSON.stringify(configForHash));
            } catch (error) {
                return 'default';
            }
        }

        /**
         * Simple hash function for strings
         */
        simpleHash(str) {
            let hash = 0;
            if (str.length === 0) return hash.toString();
            
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32-bit integer
            }
            
            return Math.abs(hash).toString(16);
        }

        /**
         * Get cached favicon if valid
         */
        getCachedFavicon() {
            try {
                // Check if localStorage is available
                if (typeof localStorage === 'undefined') {
                    this.log('localStorage not available, skipping cache');
                    return null;
                }

                const cacheData = localStorage.getItem(this.cacheKey);
                if (!cacheData) {
                    this.log('No cached favicon found');
                    return null;
                }

                const parsedCache = JSON.parse(cacheData);
                
                // Validate cache structure
                if (!parsedCache.signature || !parsedCache.dataUrl || !parsedCache.timestamp) {
                    this.log('Invalid cache structure, clearing cache');
                    this.clearCache();
                    return null;
                }

                // Check if cache is expired
                const now = Date.now();
                const cacheAge = now - parsedCache.timestamp;
                const maxAge = this.config.cacheExpiration * 24 * 60 * 60 * 1000; // Convert days to milliseconds
                
                if (cacheAge > maxAge) {
                    this.log('Cache expired, clearing');
                    this.clearCache();
                    return null;
                }

                // Check if page signature matches
                if (parsedCache.signature !== this.pageSignature) {
                    this.log('Page signature changed, cache invalid');
                    this.clearCache();
                    return null;
                }

                this.log('Valid cached favicon found');
                return parsedCache.dataUrl;

            } catch (error) {
                this.logError('Error reading cache:', error);
                this.clearCache(); // Clear corrupted cache
                return null;
            }
        }

        /**
         * Cache the generated favicon
         */
        cacheFavicon(dataUrl) {
            try {
                // Check if localStorage is available
                if (typeof localStorage === 'undefined') {
                    this.log('localStorage not available, skipping cache storage');
                    return;
                }

                const cacheData = {
                    signature: this.pageSignature,
                    dataUrl: dataUrl,
                    timestamp: Date.now(),
                    version: '1.0.0'
                };

                localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
                this.log('Favicon cached successfully');

            } catch (error) {
                this.logError('Error caching favicon:', error);
                
                // Handle quota exceeded error
                if (error.name === 'QuotaExceededError') {
                    this.log('localStorage quota exceeded, clearing old cache');
                    this.clearCache();
                }
            }
        }

        /**
         * Clear favicon cache
         */
        clearCache() {
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.removeItem(this.cacheKey);
                    this.log('Cache cleared');
                }
            } catch (error) {
                this.logError('Error clearing cache:', error);
            }
        }

        /**
         * Get cache info for debugging
         */
        getCacheInfo() {
            try {
                if (typeof localStorage === 'undefined') {
                    return { available: false };
                }

                const cacheData = localStorage.getItem(this.cacheKey);
                if (!cacheData) {
                    return { available: true, cached: false };
                }

                const parsedCache = JSON.parse(cacheData);
                const now = Date.now();
                const cacheAge = now - parsedCache.timestamp;
                const maxAge = this.config.cacheExpiration * 24 * 60 * 60 * 1000;

                return {
                    available: true,
                    cached: true,
                    signature: parsedCache.signature,
                    currentSignature: this.pageSignature,
                    timestamp: parsedCache.timestamp,
                    ageMinutes: Math.floor(cacheAge / (1000 * 60)),
                    maxAgeMinutes: Math.floor(maxAge / (1000 * 60)),
                    expired: cacheAge > maxAge,
                    signatureMatch: parsedCache.signature === this.pageSignature
                };

            } catch (error) {
                return { available: true, cached: false, error: error.message };
            }
        }

        /**
         * Generate and apply favicon
         */
        async generate() {
            try {
                this.log('Starting favicon generation...');
                
                // Step 1: Extract page information
                const pageInfo = this.extractPageInfo();
                this.log('Page info extracted:', pageInfo);

                // Step 2: Analyze colors
                const dominantColor = await this.analyzeDominantColor();
                this.log('Dominant color found:', dominantColor);

                // Step 3: Create favicon
                const faviconDataUrl = this.createFavicon(pageInfo.initials, dominantColor);
                this.log('Favicon created successfully');

                // Step 4: Apply to page
                this.applyFavicon(faviconDataUrl);
                this.log('Favicon applied to page');

                this.initialized = true;
                return faviconDataUrl;

            } catch (error) {
                this.logError('Generation error:', error);
                
                // Retry logic
                if (this.retryCount < this.config.retryAttempts) {
                    this.retryCount++;
                    this.log(`Retrying generation (attempt ${this.retryCount}/${this.config.retryAttempts})...`);
                    
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return this.generate();
                } else {
                    // Create fallback favicon
                    this.log('Creating fallback favicon...');
                    return this.createFallbackFavicon();
                }
            }
        }

        /**
         * Extract page title and initials
         */
        extractPageInfo() {
            try {
                // Get page title from multiple sources
                let title = document.title?.trim() || 
                           document.querySelector('h1')?.textContent?.trim() || 
                           document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
                           document.querySelector('meta[name="title"]')?.getAttribute('content')?.trim() ||
                           'Website';

                // Clean title and extract meaningful words
                const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an', '&'];
                const words = title
                    .replace(/[^\w\s-]/g, ' ')  // Remove special characters except hyphens
                    .split(/[\s\-_\.]+/)        // Split on whitespace, hyphens, underscores, dots
                    .filter(word => word.length > 0)
                    .filter(word => !commonWords.includes(word.toLowerCase()));

                // Extract initials (up to 2 characters)
                let initials = '';
                
                // Try first letters of first two meaningful words
                for (let i = 0; i < Math.min(2, words.length); i++) {
                    const firstChar = words[i].charAt(0).toUpperCase();
                    if (/[A-Z0-9]/.test(firstChar)) {
                        initials += firstChar;
                    }
                }

                // Fallback: get capital letters from title
                if (initials.length < 2) {
                    const capitals = title.match(/[A-Z0-9]/g);
                    if (capitals) {
                        initials = capitals.slice(0, 2).join('');
                    }
                }

                // Final fallback: use first characters
                if (initials.length === 0) {
                    initials = title.substring(0, 2).toUpperCase().replace(/[^A-Z0-9]/g, 'W');
                }

                // Ensure at least one character
                initials = initials || 'W';

                return {
                    title,
                    initials,
                    words
                };

            } catch (error) {
                this.logError('Error extracting page info:', error);
                return {
                    title: 'Website',
                    initials: 'W',
                    words: ['Website']
                };
            }
        }

        /**
         * Analyze page for dominant color
         */
        async analyzeDominantColor() {
            try {
                // Step 1: Try to extract color from logo images
                const logoColor = await this.extractLogoColor();
                if (logoColor && !this.isInvalidColor(logoColor)) {
                    return logoColor;
                }

                // Step 2: Analyze page styling
                const styleColor = this.extractStyleColor();
                if (styleColor && !this.isInvalidColor(styleColor)) {
                    return styleColor;
                }

                // Step 3: Check CSS custom properties
                const customColor = this.extractCustomProperties();
                if (customColor && !this.isInvalidColor(customColor)) {
                    return customColor;
                }

                // Step 4: Fallback to default
                return this.config.fallbackColor;

            } catch (error) {
                this.logError('Error analyzing dominant color:', error);
                return this.config.fallbackColor;
            }
        }

        /**
         * Extract color from logo images
         */
        async extractLogoColor() {
            try {
                // Find potential logo images using multiple strategies
                const logoSelectors = [
                    'img[src*="logo" i]',           // Case-insensitive logo in src
                    'img[alt*="logo" i]',           // Case-insensitive logo in alt
                    'img[class*="logo" i]',         // Case-insensitive logo in class
                    'img[id*="logo" i]',            // Case-insensitive logo in id
                    '.logo img, #logo img',         // Images in logo containers
                    'header img:first-of-type',     // First image in header
                    '.header img:first-of-type',    // First image in header class
                    'nav img:first-of-type',        // First image in nav
                    '.brand img, .branding img'     // Brand container images
                ];

                const logoImages = new Set();
                logoSelectors.forEach(selector => {
                    try {
                        document.querySelectorAll(selector).forEach(img => logoImages.add(img));
                    } catch (e) {
                        // Ignore selector errors
                    }
                });

                if (logoImages.size === 0) {
                    this.log('No logo images found');
                    return null;
                }

                this.log(`Found ${logoImages.size} potential logo images`);

                // Try to extract color from each logo
                for (const img of logoImages) {
                    try {
                        const color = await this.extractImageColor(img);
                        if (color) {
                            this.log(`Color extracted from logo: ${color}`);
                            return color;
                        }
                    } catch (error) {
                        this.log(`Failed to extract color from image: ${img.src}`);
                        continue;
                    }
                }

                return null;

            } catch (error) {
                this.logError('Error extracting logo color:', error);
                return null;
            }
        }

        /**
         * Extract dominant color from image using canvas
         */
        extractImageColor(imgElement) {
            return new Promise((resolve) => {
                try {
                    // Create timeout for image processing
                    const timeoutId = setTimeout(() => resolve(null), this.config.timeout);

                    const img = new Image();
                    img.crossOrigin = 'anonymous';

                    img.onload = () => {
                        try {
                            clearTimeout(timeoutId);

                            // Create temporary canvas for analysis
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            
                            // Use small size for performance
                            const size = 50;
                            canvas.width = canvas.height = size;

                            // Draw scaled image
                            ctx.drawImage(img, 0, 0, size, size);

                            // Get image data
                            const imageData = ctx.getImageData(0, 0, size, size);
                            const data = imageData.data;

                            // Count colors
                            const colorFrequency = {};
                            const threshold = 20; // Color grouping threshold

                            for (let i = 0; i < data.length; i += 4) {
                                const r = data[i];
                                const g = data[i + 1];
                                const b = data[i + 2];
                                const a = data[i + 3];

                                // Skip transparent or near-transparent pixels
                                if (a < 128) continue;

                                // Skip near-white pixels
                                if (r > 240 && g > 240 && b > 240) continue;

                                // Skip near-black pixels
                                if (r < 15 && g < 15 && b < 15) continue;

                                // Group similar colors
                                const rGroup = Math.floor(r / threshold) * threshold;
                                const gGroup = Math.floor(g / threshold) * threshold;
                                const bGroup = Math.floor(b / threshold) * threshold;
                                
                                const colorKey = `${rGroup},${gGroup},${bGroup}`;
                                colorFrequency[colorKey] = (colorFrequency[colorKey] || 0) + 1;
                            }

                            // Find most frequent color
                            let dominantColor = null;
                            let maxCount = 0;

                            for (const [colorKey, count] of Object.entries(colorFrequency)) {
                                if (count > maxCount) {
                                    maxCount = count;
                                    const [r, g, b] = colorKey.split(',').map(Number);
                                    dominantColor = this.rgbToHex(r, g, b);
                                }
                            }

                            resolve(dominantColor);

                        } catch (error) {
                            clearTimeout(timeoutId);
                            this.log('Error processing image data');
                            resolve(null);
                        }
                    };

                    img.onerror = () => {
                        clearTimeout(timeoutId);
                        resolve(null);
                    };

                    // Try to load image
                    img.src = imgElement.src;

                } catch (error) {
                    resolve(null);
                }
            });
        }

        /**
         * Extract color from page styling
         */
        extractStyleColor() {
            try {
                const elementsToAnalyze = [
                    document.body,
                    document.querySelector('header'),
                    document.querySelector('.header'),
                    document.querySelector('nav'),
                    document.querySelector('.navbar'),
                    document.querySelector('.nav'),
                    document.querySelector('main'),
                    document.querySelector('.main'),
                    document.querySelector('.container')
                ].filter(Boolean);

                const colorScores = {};

                elementsToAnalyze.forEach(element => {
                    const styles = window.getComputedStyle(element);
                    
                    // Analyze background color
                    const bgColor = styles.backgroundColor;
                    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                        const hex = this.colorToHex(bgColor);
                        if (hex && !this.isInvalidColor(hex)) {
                            colorScores[hex] = (colorScores[hex] || 0) + 2;
                        }
                    }

                    // Analyze border colors
                    const borderColor = styles.borderColor;
                    if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)' && borderColor !== 'transparent') {
                        const hex = this.colorToHex(borderColor);
                        if (hex && !this.isInvalidColor(hex)) {
                            colorScores[hex] = (colorScores[hex] || 0) + 1;
                        }
                    }

                    // Analyze accent colors (with lower weight)
                    const textColor = styles.color;
                    if (textColor && textColor !== 'rgba(0, 0, 0, 0)' && textColor !== 'transparent') {
                        const hex = this.colorToHex(textColor);
                        if (hex && !this.isInvalidColor(hex) && !this.isNearBlack(hex)) {
                            colorScores[hex] = (colorScores[hex] || 0) + 0.5;
                        }
                    }
                });

                // Find highest scoring color
                let bestColor = null;
                let maxScore = 0;

                for (const [color, score] of Object.entries(colorScores)) {
                    if (score > maxScore) {
                        maxScore = score;
                        bestColor = color;
                    }
                }

                return bestColor;

            } catch (error) {
                this.logError('Error extracting style color:', error);
                return null;
            }
        }

        /**
         * Extract colors from CSS custom properties
         */
        extractCustomProperties() {
            try {
                const rootStyles = window.getComputedStyle(document.documentElement);
                
                // Common CSS custom property names for brand colors
                const brandPropertyNames = [
                    '--primary-color',
                    '--brand-color',
                    '--accent-color',
                    '--theme-color',
                    '--main-color',
                    '--primary',
                    '--brand',
                    '--accent'
                ];

                for (const propName of brandPropertyNames) {
                    const value = rootStyles.getPropertyValue(propName).trim();
                    if (value) {
                        const hex = this.colorToHex(value);
                        if (hex && !this.isInvalidColor(hex)) {
                            this.log(`Found custom property ${propName}: ${hex}`);
                            return hex;
                        }
                    }
                }

                return null;

            } catch (error) {
                this.logError('Error extracting custom properties:', error);
                return null;
            }
        }

        /**
         * Create favicon using canvas
         */
        createFavicon(initials, backgroundColor) {
            try {
                // Create canvas
                this.canvas = document.createElement('canvas');
                this.canvas.width = this.config.size;
                this.canvas.height = this.config.size;
                this.ctx = this.canvas.getContext('2d');

                // Set background
                this.ctx.fillStyle = backgroundColor;
                this.ctx.fillRect(0, 0, this.config.size, this.config.size);

                // Configure text
                const fontSize = Math.floor(this.config.size * (initials.length === 1 ? 0.65 : 0.5));
                this.ctx.font = `bold ${fontSize}px ${this.config.fontFamily}`;
                this.ctx.fillStyle = this.config.textColor;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';

                // Add text shadow if enabled
                if (this.config.enableShadow) {
                    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                    this.ctx.shadowOffsetX = 1;
                    this.ctx.shadowOffsetY = 1;
                    this.ctx.shadowBlur = 1;
                }

                // Draw text
                const centerX = this.config.size / 2;
                const centerY = this.config.size / 2;
                this.ctx.fillText(initials, centerX, centerY);

                return this.canvas.toDataURL('image/png');

            } catch (error) {
                this.logError('Error creating favicon:', error);
                throw error;
            }
        }

        /**
         * Apply favicon to page
         */
        applyFavicon(dataUrl) {
            try {
                // Remove existing favicon elements
                const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
                existingFavicons.forEach(link => {
                    // Only remove if it's not a manually added favicon with specific attributes
                    if (!link.hasAttribute('data-manual')) {
                        link.remove();
                    }
                });

                // Create and add new favicon
                const faviconLink = document.createElement('link');
                faviconLink.rel = 'icon';
                faviconLink.type = 'image/png';
                faviconLink.href = dataUrl;
                faviconLink.setAttribute('data-auto-generated', 'true');
                document.head.appendChild(faviconLink);

                // Add shortcut icon for legacy browsers
                const shortcutLink = document.createElement('link');
                shortcutLink.rel = 'shortcut icon';
                shortcutLink.type = 'image/png';
                shortcutLink.href = dataUrl;
                shortcutLink.setAttribute('data-auto-generated', 'true');
                document.head.appendChild(shortcutLink);

                this.log('Favicon applied successfully');

            } catch (error) {
                this.logError('Error applying favicon:', error);
                throw error;
            }
        }

        /**
         * Create fallback favicon
         */
        createFallbackFavicon() {
            try {
                this.log('Creating fallback favicon...');
                const fallbackDataUrl = this.createFavicon('W', this.config.fallbackColor);
                this.applyFavicon(fallbackDataUrl);
                return fallbackDataUrl;
            } catch (error) {
                this.logError('Error creating fallback favicon:', error);
                return null;
            }
        }

        /**
         * Utility: Convert color to hex
         */
        colorToHex(color) {
            try {
                if (!color) return null;

                // Already hex
                if (color.startsWith('#')) {
                    return color.length === 7 ? color : null;
                }

                // RGB/RGBA format
                const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (rgbMatch) {
                    const r = parseInt(rgbMatch[1]);
                    const g = parseInt(rgbMatch[2]);
                    const b = parseInt(rgbMatch[3]);
                    return this.rgbToHex(r, g, b);
                }

                // HSL format (basic conversion)
                const hslMatch = color.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%/);
                if (hslMatch) {
                    const h = parseInt(hslMatch[1]);
                    const s = parseInt(hslMatch[2]) / 100;
                    const l = parseInt(hslMatch[3]) / 100;
                    return this.hslToHex(h, s, l);
                }

                return null;

            } catch (error) {
                return null;
            }
        }

        /**
         * Convert RGB to hex
         */
        rgbToHex(r, g, b) {
            return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        }

        /**
         * Convert HSL to hex
         */
        hslToHex(h, s, l) {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            
            const r = Math.round(hue2rgb(p, q, h / 360 + 1/3) * 255);
            const g = Math.round(hue2rgb(p, q, h / 360) * 255);
            const b = Math.round(hue2rgb(p, q, h / 360 - 1/3) * 255);

            return this.rgbToHex(r, g, b);
        }

        /**
         * Check if color is invalid (too light, too dark, etc.)
         */
        isInvalidColor(hex) {
            return this.isNearWhite(hex) || this.isNearBlack(hex) || !hex || hex.length !== 7;
        }

        /**
         * Check if color is near white
         */
        isNearWhite(hex) {
            if (!hex || hex.length !== 7) return false;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return r > 240 && g > 240 && b > 240;
        }

        /**
         * Check if color is near black
         */
        isNearBlack(hex) {
            if (!hex || hex.length !== 7) return false;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return r < 30 && g < 30 && b < 30;
        }

        /**
         * Logging utility
         */
        log(...args) {
            if (this.config.enableLogging) {
                console.log('[FaviconGenerator]', ...args);
            }
        }

        /**
         * Error logging utility
         */
        logError(...args) {
            console.error('[FaviconGenerator]', ...args);
        }

        /**
         * Manual regeneration method
         */
        async regenerate(newConfig = {}) {
            try {
                // Update configuration
                this.config = { ...this.config, ...newConfig };
                this.retryCount = 0;
                
                // Clear cache if force regeneration
                if (this.config.forceRegenerate) {
                    this.clearCache();
                }
                
                // Regenerate page signature with new config
                this.pageSignature = this.generatePageSignature();
                
                // Regenerate favicon
                return await this.generate();
                
            } catch (error) {
                this.logError('Error during regeneration:', error);
                return this.createFallbackFavicon();
            }
        }

        /**
         * Get current configuration
         */
        getConfig() {
            return { ...this.config };
        }

        /**
         * Update configuration
         */
        updateConfig(newConfig) {
            this.config = { ...this.config, ...newConfig };
            this.log('Configuration updated:', this.config);
        }

        /**
         * Force clear cache and regenerate
         */
        async forceClearAndRegenerate() {
            this.clearCache();
            this.config.forceRegenerate = true;
            return await this.regenerate();
        }
    }

    /**
     * Factory function for easy initialization
     */
    function createFaviconGenerator(config = {}) {
        return new FaviconGenerator(config);
    }

    /**
     * Simple initialization function
     */
    function autoFavicon(config = {}) {
        if (!global.faviconGenerator) {
            global.faviconGenerator = createFaviconGenerator(config);
        }
        return global.faviconGenerator.init();
    }

    // Export for different module systems
    if (typeof module !== 'undefined' && module.exports) {
        // Node.js/CommonJS
        module.exports = {
            FaviconGenerator,
            createFaviconGenerator,
            autoFavicon
        };
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define([], function() {
            return {
                FaviconGenerator,
                createFaviconGenerator,
                autoFavicon
            };
        });
    } else {
        // Browser global
        global.FaviconGenerator = FaviconGenerator;
        global.createFaviconGenerator = createFaviconGenerator;
        global.autoFavicon = autoFavicon;
        
        // Auto-initialize in browser if not disabled
        if (typeof window !== 'undefined' && !global.DISABLE_AUTO_FAVICON) {
            // Wait a bit to ensure page content is loaded
            setTimeout(() => {
                autoFavicon();
            }, 100);
        }
    }

})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
