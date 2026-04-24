// src/vendor/preact-entry.js
import * as preact from 'preact';
import * as hooks from 'preact/hooks';
import htm from 'htm';

// Named exports
export * from 'preact';
export * from 'preact/hooks';
export { htm };

// Default export is htm itself (common pattern)
export default htm;
