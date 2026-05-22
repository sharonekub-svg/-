const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const fallbackStyle = `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&display=swap" rel="stylesheet" />
    <style id="shakana-boot-fallback-style">
      body {
        margin: 0;
        background: #F7F5F0;
        font-family: 'Rubik', Arial, sans-serif;
      }
      #root {
        position: relative;
        z-index: 1;
      }
      .shakana-fallback {
        position: fixed;
        inset: 0;
        z-index: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: #F7F5F0;
        text-align: center;
        animation: shakana-fade-out 0.4s ease 8s forwards;
      }
      @keyframes shakana-fade-out {
        to { opacity: 0; pointer-events: none; }
      }
      .shakana-fallback-card {
        width: min(400px, 100%);
        border: 1px solid #E8E2DA;
        border-radius: 20px;
        background: #FFFFFF;
        padding: 32px 28px;
        box-shadow: 0 2px 16px rgba(28,25,23,0.07);
      }
      .shakana-fallback-dot {
        display: inline-block;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #B86B4B;
        margin-bottom: 14px;
      }
      .shakana-fallback-logo {
        margin: 0 0 6px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #B86B4B;
      }
      .shakana-fallback-text {
        margin: 0;
        color: #78716C;
        font-size: 14px;
        line-height: 1.7;
      }
    </style>`;

const fallbackMarkup = `
    <div class="shakana-fallback" aria-hidden="true">
      <div class="shakana-fallback-card">
        <div class="shakana-fallback-dot"></div>
        <p class="shakana-fallback-logo">shakana</p>
        <p class="shakana-fallback-text">האפליקציה נטענת. אם המסך נשאר כך, רענן פעם אחת כדי לקבל את הגרסה החדשה.</p>
      </div>
    </div>`;

html = html
  .replace('<html lang="en">', '<html lang="he" dir="rtl">')
  .replace('</head>', `${fallbackStyle}\n  </head>`)
  .replace('<!-- The root element for your Expo app. -->', `${fallbackMarkup}\n    <!-- The root element for your Expo app. -->`);

fs.writeFileSync(htmlPath, html);
