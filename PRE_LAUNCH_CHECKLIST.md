# Pre-Launch Final Checklist

Complete checklist for CodeLedger v1.1.0 launch to Chrome Web Store and Firefox Add-ons.

---

## Phase 1: Code Quality & Security

### Build & Quality

- [ ] \
pm run lint\ passes (no TypeScript errors)
- [ ] \
pm run build\ succeeds (CSS + extension builds)
- [ ] \
pm run build:css\ output correct (\src/ui/styles/compiled.css\ exists)
- [ ] No console errors in DevTools when extension loads
- [ ] No warnings in browser console

### Extension Functionality

- [ ] **Platform Detection**
  - [ ] LeetCode page detected correctly
  - [ ] GeeksForGeeks page detected correctly
  - [ ] Codeforces page detected correctly

- [ ] **Problem Solving**
  - [ ] Solve problem on each platform
  - [ ] "Accepted" verdict recognized
  - [ ] Code extracted correctly
  - [ ] Metadata captured (difficulty, tags, language)

- [ ] **GitHub Integration**
  - [ ] OAuth flow works (test with real GitHub account)
  - [ ] Token saved securely (\uth.tokens\, not \settings\)
  - [ ] Commit created with correct structure: \	opics/{topic}/{slug}/\
  - [ ] README.md generated with problem statement
  - [ ] Code file has correct extension
  - [ ] index.json created and valid JSON

- [ ] **AI Review** (if enabled)
  - [ ] AI review created (ai-review.md)
  - [ ] Complexity analysis present
  - [ ] AI provider fallback works (disable one key, verify next provider)
  - [ ] Timeout handling works (AI call takes too long, continues)

- [ ] **Dashboard**
  - [ ] Loads correctly
  - [ ] Heatmap displays
  - [ ] Problem list visible
  - [ ] Search filters work
  - [ ] Knowledge graph renders
  - [ ] Analytics show correct data

- [ ] **Settings**
  - [ ] Settings persist across sessions
  - [ ] AI keys stored securely (\i.keys\, not \settings\)
  - [ ] OAuth token displayed (masked)
  - [ ] Clear data button works

- [ ] **Uninstall**
  - [ ] Reinstall extension
  - [ ] No data recovered (clean uninstall)
  - [ ] Fresh welcome screen shown

### Security Verification

- [ ] No hardcoded API keys, secrets, or credentials
- [ ] No console.log calls (use createDebugger only)
- [ ] No chrome.* calls outside browser-compat.js
- [ ] OAuth tokens stored in \uth.tokens\ (not settings)
- [ ] AI keys stored in \i.keys\ (not settings)
- [ ] No network calls to external analytics or tracking
- [ ] CSP is strict (no unsafe-eval, no inline scripts)
- [ ] No cross-origin requests except GitHub + AI providers + Cloudflare Worker

### Browser Compatibility

- [ ] **Chrome** 120+ (latest)
- [ ] **Firefox** 121+ (latest)
- [ ] **Edge** (Chromium, should work but not primary target)
- [ ] **Brave** (should work)

Test on at least Chrome and Firefox.

---

## Phase 2: Documentation & Content

### Code Documentation

- [ ] ARCHITECTURE.md complete and accurate
- [ ] CODE_OF_CONDUCT.md present (Contributor Covenant 2.1)
- [ ] SECURITY.md complete with vulnerability disclosure
- [ ] CONTRIBUTING.md clear on contribution process
- [ ] All code comments follow guidelines (only WHY, not WHAT)
- [ ] CHANGELOG.md formatted correctly (Keep a Changelog)

### Release Documentation

- [ ] VERSION_TIMING.md explains when to bump version
- [ ] RELEASE_VERSIONING.md covers patch/minor/major examples
- [ ] RELEASE_GUIDE.md walkthrough complete
- [ ] RELEASE_QUICK_START.md updated

### Store Documentation

- [ ] STORE_SUBMISSION.md complete (Chrome, Firefox, Edge notes)
- [ ] PRIVACY.md created and links included
- [ ] README.md matches store descriptions (no inconsistencies)

### README Review

- [ ] Title and description match store listings
- [ ] Installation instructions correct (src/ folder, not dist/)
- [ ] OAuth flow explanation accurate (Worker URL, not chromiumapp.org)
- [ ] All AI providers listed and explained
- [ ] Links tested (no 404s)
- [ ] Icons visible and paths correct
- [ ] Social preview image set

---

## Phase 3: Store Assets

### Chrome Web Store

- [ ] Icon 128×128: src/icons/icon-128.png (present and correct)
- [ ] Screenshots (5 recommended):
  - [ ] Setup/welcome flow
  - [ ] Problem detection
  - [ ] Dashboard
  - [ ] Knowledge graph
  - [ ] AI review example
- [ ] Store listing fields prepared:
  - [ ] Title: "CodeLedger"
  - [ ] Short description (70 chars)
  - [ ] Full description (1,400+ chars)
  - [ ] Category: Productivity
  - [ ] Permissions justified
  - [ ] Support email: github@vkrishna04.me
  - [ ] Homepage: https://codeledger.vkrishna04.me
  - [ ] Privacy policy linked: PRIVACY.md

### Firefox Add-ons

- [ ] Icons (48, 96, 128): src/icons/icon-*.png
- [ ] Screenshots (5):
  - [ ] Setup flow
  - [ ] Problem page
  - [ ] Dashboard
  - [ ] Knowledge graph
  - [ ] AI review
- [ ] Store listing fields:
  - [ ] Name: "CodeLedger"
  - [ ] Summary (250 chars max)
  - [ ] Description (1,000+ chars)
  - [ ] Support email: github@vkrishna04.me
  - [ ] Privacy policy: https://github.com/Life-Experimentalist/Code-Ledger/blob/main/PRIVACY.md

### Microsoft Edge Add-ons (Future)

- [ ] Same assets as Chrome (reuse)
- [ ] Reminder: Will submit in v1.3.0+

---

## Phase 4: Marketing & Announcement

### LinkedIn

- [ ] Post drafted (LINKEDIN_POST.md ready)
- [ ] Images selected (dashboard, graph, commit example)
- [ ] Hashtags prepared (#dsa #leetcode #github #opensource)
- [ ] Links verified (no 404s)

### GitHub

- [ ] Release created with:
  - [ ] Release notes (from CHANGELOG)
  - [ ] 3 zips attached (Chrome, Firefox, source)
  - [ ] Version matches tag (v1.1.0)

### Announcements

- [ ] GitHub Discussions opened for feedback
- [ ] GitHub Issues: "Ready for feedback on v1.1.0" label
- [ ] README section: "First Release" or "Just Released"

---

## Phase 5: Version & Release

### Version Sync

- [ ] src/manifest.json: \"version": "1.1.0"\
- [ ] package.json: \"version": "1.1.0"\
- [ ] Versions match (critical!)
- [ ] Verified with: \grep version src/manifest.json package.json\

### CHANGELOG

- [ ] docs/CHANGELOG.md has [1.1.0] entry
- [ ] Sections present: Added, Fixed, Changed (at minimum)
- [ ] All features listed
- [ ] Date format correct: YYYY-MM-DD
- [ ] Format follows Keep a Changelog

### Release Process

- [ ] \
pm run release -- --dry-run\ preview looks good
- [ ] Working directory clean: \git status\
- [ ] Ready to release: \
pm run release\
- [ ] GitHub Actions triggered (check workflow)
- [ ] Release appears on GitHub: https://github.com/Life-Experimentalist/Code-Ledger/releases/tag/v1.1.0
- [ ] Zips downloaded and verified: \unzip -t releases/*.zip\

---

## Phase 6: Store Submission

### Before Uploading

- [ ] Download zips from GitHub release (3 zips):
  - [ ] codeledger-chrome-v1.1.0.zip
  - [ ] codeledger-firefox-v1.1.0.zip
  - [ ] codeledger-source-v1.1.0.zip

- [ ] Test zips locally (optional but recommended):
  - [ ] Chrome: Load unpacked from zip contents
  - [ ] Firefox: Test with web-ext or manual load
  - [ ] Verify it works with real GitHub account

### Chrome Web Store

- [ ] Create developer account (if not done)
- [ ] Payment info on file (\ registration)
- [ ] Listing filled (see Phase 3)
- [ ] Screenshots uploaded
- [ ] Icons uploaded
- [ ] Upload zip: codeledger-chrome-v1.1.0.zip
- [ ] Review and accept terms
- [ ] Submit for review
- [ ] 📧 Await review (1–7 days)

### Firefox Add-ons

- [ ] Create developer account (if not done)
- [ ] Listing filled (see Phase 3)
- [ ] Screenshots uploaded
- [ ] Icons uploaded
- [ ] Upload zip: codeledger-firefox-v1.1.0.zip
- [ ] Accept terms
- [ ] Submit for review
- [ ] 📧 Await review (1–5 days)

---

## Phase 7: Post-Launch

### Week 1

- [ ] Monitor reviews on both stores
- [ ] Respond to user feedback
- [ ] Check for crash reports
- [ ] Fix critical bugs (if any)
- [ ] Post on LinkedIn with announcement
- [ ] Share on GitHub discussions

### Ongoing

- [ ] Monitor store ratings
- [ ] Respond to reviews and issues
- [ ] Plan next release (v1.2.0 features)
- [ ] Security updates: prioritize and release ASAP

---

## Final Verification

Before you declare "ready to launch", verify:

`ash
# 1. Code quality
npm run lint           # Should pass
npm run build          # Should succeed

# 2. Version sync
grep version src/manifest.json package.json  # Should match 1.1.0

# 3. CHANGELOG
grep "## \[1.1.0\]" docs/CHANGELOG.md       # Should exist

# 4. Release preview
npm run release -- --dry-run                # Should show success preview

# 5. All documentation
ls -la docs/*.md                            # Should see all docs
ls -la *.md                                 # Should see README, PRIVACY, etc.
`

If all pass: ✅ **Ready for release and store submission**

---

## Approval Gate

Before running \
pm run release\, get approval on:

- [ ] Code quality reviewed (lint, build)
- [ ] Documentation complete (all .md files)
- [ ] Security verified (no secrets, no tracking)
- [ ] Functionality tested (all platforms, features)
- [ ] Store listings ready (screenshots, descriptions)
- [ ] Marketing ready (LinkedIn post drafted)

Then:

`ash
npm run release  # One command releases everything!
`

---

**Last updated**: 2026-05-07
**Version**: 1.1.0
**Status**: Ready for launch checklist
