// Detect if CodeLedger is installed by waiting for the injected marker
document.addEventListener('DOMContentLoaded', () => {
    // Wait a short moment for content script to inject the marker
    setTimeout(() => {
        const isInstalled = document.getElementById('codeledger-present') !== null;
        const installBtn = document.getElementById('install-btn');
        
        if (isInstalled) {
            installBtn.textContent = 'Extension Installed 🎉';
            installBtn.classList.remove('btn-primary');
            installBtn.classList.add('btn-secondary');
            installBtn.href = '#';
            installBtn.style.pointerEvents = 'none';
        }
    }, 500);
});
