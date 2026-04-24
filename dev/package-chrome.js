import AdmZip from 'adm-zip'; // Requires npm install adm-zip

const zip = new AdmZip();
zip.addLocalFolder('./src', '');
zip.writeZip('./releases/codeledger-chrome-v1.0.0.zip');
console.log('Chrome extension packaged.');
