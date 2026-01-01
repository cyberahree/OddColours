{
    const TITLES = [
        "browse the indexes for a sacrifice",
        "find a file to oddify",
        "select anything to begin",
        "choose a file to transform",
        "what the hell does this button do.?",
        "upload a file, if you dare",
        "pick a file to weirdify",
        "you dont wanna know what happens when you click this",
        "select a file if you think you can handle it",
        "choose something strange",
        "file of the day",
        "embrace the oddness",
        "let's get weird",
        "time to oddify",
        "upload something unusual"
    ];

    const UPLOAD_BOX = document.getElementById('uploadbox');
    const UPLOAD_SPAN = UPLOAD_BOX.querySelector('span');
    
    const HEADING_ROOT = document.getElementById('heading');
    const HEADING_SPAN = HEADING_ROOT.querySelector('.stretch');
    
    const FOOTER = document.querySelector('footer');
    const LEGAL = FOOTER.querySelector('#legal');

    // generate numeric hash from string
    function hashString(str) {
        let hash = 0;

        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        return Math.abs(hash);
    }

    // convert hash to hex color with good contrast on black background
    function hashToColor(hash) {
        // use hash to generate HSL values for vibrant colors
        const hue = hash % 360;
        const saturation = 70 + (Math.floor(hash / 360) % 30); // 70-100%
        const lightness = 50 + (Math.floor(hash / 360 / 30) % 20); // 50-70%
        
        // convert HSL to RGB
        const c = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
        const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
        const m = lightness / 100 - c / 2;
        
        let r, g, b;
        if (hue < 60) {
            r = c; g = x; b = 0;
        } else if (hue < 120) {
            r = x; g = c; b = 0;
        } else if (hue < 180) {
            r = 0; g = c; b = x;
        } else if (hue < 240) {
            r = 0; g = x; b = c;
        } else if (hue < 300) {
            r = x; g = 0; b = c;
        } else {
            r = c; g = 0; b = x;
        }
        
        const toHex = (n) => {
            const hex = Math.round((n + m) * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    // fit heading text to container width
    function fitTextX() {
        HEADING_SPAN.style.transform = "scaleX(1)";
        const available = HEADING_ROOT.clientWidth;
        const natural = HEADING_SPAN.getBoundingClientRect().width;

        if (natural > 0) {
            HEADING_SPAN.style.transform = `scaleX(${available / natural})`;
        }
    }

    // interpolate between two hex colors
    function interpolateColor(color1, color2, t) {
        const r1 = parseInt(color1.slice(1, 3), 16);
        const g1 = parseInt(color1.slice(3, 5), 16);
        const b1 = parseInt(color1.slice(5, 7), 16);
        
        const r2 = parseInt(color2.slice(1, 3), 16);
        const g2 = parseInt(color2.slice(3, 5), 16);
        const b2 = parseInt(color2.slice(5, 7), 16);
        
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    let currentColor = '#9d0ac2';
    let animationFrame;

    // update theme colors based on timestamp with smooth transition
    function updateTheme() {
        const timestamp = Date.now().toString();
        const hash = hashString(timestamp);
        const newColor = hashToColor(hash);

        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }

        const startTime = Date.now();
        const duration = 2000;
        const startColor = currentColor;

        function animate() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const color = interpolateColor(startColor, newColor, progress);
            
            document.documentElement.style.setProperty('--theme-color', color);
            
            if (progress < 1) {
                animationFrame = requestAnimationFrame(animate);
            } else {
                currentColor = newColor;
            }
        }

        animate();
    }

    // update upload text with random title
    function updateUploadSpan() {
        const timestamp = Date.now().toString();
        const hash = hashString(timestamp);
        const index = hash % TITLES.length;
        const title = TITLES[index];

        UPLOAD_SPAN.textContent = title.toUpperCase();
    }

    // initialize
    LEGAL.textContent = `© ${window.location.host} ${new Date().getFullYear()}`;

    fitTextX();
    updateTheme();
    updateUploadSpan();
    setInterval(updateTheme, 2000);
    window.addEventListener("load", fitTextX);
    window.addEventListener("resize", fitTextX);
}