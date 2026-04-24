/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// This script injects an invisible marker so the landing page knows CodeLedger is installed.
// RanobeGemini extension detection pattern

(function injectPresenceMarker() {
  if (document.getElementById('codeledger-present')) return;

  const marker = document.createElement('div');
  marker.id = 'codeledger-present';
  marker.style.display = 'none';
  marker.setAttribute('data-version', chrome.runtime.getManifest().version);
  
  document.body.appendChild(marker);
})();
