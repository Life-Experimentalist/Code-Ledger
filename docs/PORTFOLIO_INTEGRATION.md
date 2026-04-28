# Portfolio Integration

CodeLedger seamlessly integrates with React/Vite portfolios driven by `settings.json`.

## Setup

In your portfolio repository (e.g., `VKrishna04.github.io`), update `public/settings.json` to include the CodeLedger integration:

```json
{
  "integrations": {
    "codeledger": {
      "enabled": true,
      "dsaRepoOwner": "vkrishna04",
      "dsaRepoName": "CodeLedger-Sync",
      "statsDisplaySection": "skills",
      "showInHero": true,
      "badgeStyle": "flat-square"
    }
  }
}
```

### Data Bridge

The portfolio should fetch the raw `index.json` from the target GitHub repository using the standard GitHub API.

```javascript
// React Hook Example
function useDSAStats(config) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!config.enabled) return;
    fetch(\`https://api.github.com/repos/\${config.dsaRepoOwner}/\${config.dsaRepoName}/contents/index.json\`, {
      headers: { 'Accept': 'application/vnd.github.raw' }
    })
      .then(res => res.json())
      .then(data => setStats(data.stats));
  }, [config]);

  return stats;
}
```
