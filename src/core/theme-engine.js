/**
 * CodeLedger Theme Engine
 * Ported and adapted from Ranobe Gemini v4.6.0 theme-config.js.
 * Replaces browser.storage with Storage.getTheme() / Storage.setTheme().
 * Adds --cl-* CodeLedger-specific CSS custom properties on top of palette.
 */

import { Storage } from "./storage.js";

// ─────────────────────────────────────────────────────────────
// Default theme settings
// ─────────────────────────────────────────────────────────────

export const DEFAULT_THEME = {
  mode: "dark",
  preset: "material-dark",
  basePreset: "",
  accentPrimary: "",
  accentSecondary: "",
  bgColor: "",
  bgSecondary: "",
  bgTertiary: "",
  textColor: "",
  customPresets: {},
  autoBehavior: "system",
  timeCustomStart: "06:00",
  timeCustomEnd: "18:00",
};

// ─────────────────────────────────────────────────────────────
// Preset Theme Skins (verbatim from Ranobe Gemini v4.6.0)
// ─────────────────────────────────────────────────────────────

export const THEME_PRESETS = {
  "material-dark": {
    meta: { name: "Material Dark", emoji: "🌑", group: "default", animation: "none" },
    dark: {
      "primary-color": "#bb86fc", "primary-hover": "#9b66dc", "secondary-color": "#9ca3af",
      "danger-color": "#ef4444", "success-color": "#22c55e",
      "bg-primary": "#0f172a", "bg-secondary": "#111827", "bg-tertiary": "#1f2937",
      "bg-card": "#1f2937", "bg-card-hover": "#2b3544",
      "text-primary": "#e5e7eb", "text-secondary": "#9ca3af", "text-muted": "#6b7280",
      "border-color": "#2f3644", "border-light": "#3b4454",
    },
    light: {
      "primary-color": "#6200ee", "primary-hover": "#5000cc", "secondary-color": "#6b7280",
      "danger-color": "#ef4444", "success-color": "#22c55e",
      "bg-primary": "#f3f4f6", "bg-secondary": "#ffffff", "bg-tertiary": "#e5e7eb",
      "bg-card": "#ffffff", "bg-card-hover": "#f3f4f6",
      "text-primary": "#111827", "text-secondary": "#374151", "text-muted": "#6b7280",
      "border-color": "#e5e7eb", "border-light": "#d1d5db",
    },
    content: {
      dark: { primary: "#bb86fc", onPrimary: "#ffffff", onSurface: "#e1e1e1", onSurfaceVariant: "#b3b3b3", surface: "#121212", surfaceVariant: "#1e1e1e", outline: "#3a3a3a", outlineVariant: "#4a4a4a", overlay: "rgba(255,255,255,0.08)", overlayHover: "rgba(255,255,255,0.12)", error: "#cf6679", success: "#81c784" },
      light: { primary: "#6200ee", onPrimary: "#ffffff", onSurface: "#1c1c1c", onSurfaceVariant: "#5f5f5f", surface: "#ffffff", surfaceVariant: "#f5f5f5", outline: "#d0d0d0", outlineVariant: "#e0e0e0", overlay: "rgba(0,0,0,0.05)", overlayHover: "rgba(0,0,0,0.08)", error: "#b00020", success: "#4caf50" },
    },
  },

  "material-light": {
    meta: { name: "Material Light", emoji: "☀️", group: "default", animation: "none", defaultMode: "light" },
    dark: {
      "primary-color": "#7c4dff", "primary-hover": "#651fff", "secondary-color": "#9ca3af",
      "danger-color": "#ef4444", "success-color": "#22c55e",
      "bg-primary": "#1a1a2e", "bg-secondary": "#16213e", "bg-tertiary": "#1f2937",
      "bg-card": "#1f2937", "bg-card-hover": "#2b3544",
      "text-primary": "#e5e7eb", "text-secondary": "#9ca3af", "text-muted": "#6b7280",
      "border-color": "#2f3644", "border-light": "#3b4454",
    },
    light: {
      "primary-color": "#7c4dff", "primary-hover": "#651fff", "secondary-color": "#6b7280",
      "danger-color": "#ef4444", "success-color": "#22c55e",
      "bg-primary": "#fafafa", "bg-secondary": "#ffffff", "bg-tertiary": "#f0f0f0",
      "bg-card": "#ffffff", "bg-card-hover": "#f5f5f5",
      "text-primary": "#212121", "text-secondary": "#616161", "text-muted": "#9e9e9e",
      "border-color": "#e0e0e0", "border-light": "#eeeeee",
    },
    content: {
      dark: { primary: "#7c4dff", onPrimary: "#ffffff", onSurface: "#e1e1e1", onSurfaceVariant: "#b3b3b3", surface: "#1a1a2e", surfaceVariant: "#16213e", outline: "#2f3644", outlineVariant: "#3b4454", overlay: "rgba(255,255,255,0.08)", overlayHover: "rgba(255,255,255,0.12)", error: "#cf6679", success: "#81c784" },
      light: { primary: "#7c4dff", onPrimary: "#ffffff", onSurface: "#212121", onSurfaceVariant: "#616161", surface: "#fafafa", surfaceVariant: "#f0f0f0", outline: "#e0e0e0", outlineVariant: "#eeeeee", overlay: "rgba(0,0,0,0.04)", overlayHover: "rgba(0,0,0,0.08)", error: "#b00020", success: "#4caf50" },
    },
  },

  ocean: {
    meta: { name: "Ocean", emoji: "🌊", group: "skin", animation: "waves" },
    dark: {
      "primary-color": "#00bcd4", "primary-hover": "#00acc1", "secondary-color": "#80deea",
      "danger-color": "#ef5350", "success-color": "#66bb6a",
      "bg-primary": "#0a1628", "bg-secondary": "#0d1f3c", "bg-tertiary": "#132d50",
      "bg-card": "#132d50", "bg-card-hover": "#1a3a64",
      "text-primary": "#e0f7fa", "text-secondary": "#80cbc4", "text-muted": "#4db6ac",
      "border-color": "#1a3a64", "border-light": "#245080",
    },
    light: {
      "primary-color": "#0097a7", "primary-hover": "#00838f", "secondary-color": "#00838f",
      "danger-color": "#ef5350", "success-color": "#66bb6a",
      "bg-primary": "#e0f7fa", "bg-secondary": "#ffffff", "bg-tertiary": "#b2ebf2",
      "bg-card": "#ffffff", "bg-card-hover": "#e0f7fa",
      "text-primary": "#004d40", "text-secondary": "#00695c", "text-muted": "#80cbc4",
      "border-color": "#b2ebf2", "border-light": "#e0f7fa",
    },
    content: {
      dark: { primary: "#00bcd4", onPrimary: "#000000", onSurface: "#e0f7fa", onSurfaceVariant: "#80cbc4", surface: "#0a1628", surfaceVariant: "#0d1f3c", outline: "#1a3a64", outlineVariant: "#245080", overlay: "rgba(0,188,212,0.08)", overlayHover: "rgba(0,188,212,0.12)", error: "#ef5350", success: "#66bb6a" },
      light: { primary: "#0097a7", onPrimary: "#ffffff", onSurface: "#004d40", onSurfaceVariant: "#00695c", surface: "#e0f7fa", surfaceVariant: "#b2ebf2", outline: "#b2ebf2", outlineVariant: "#e0f7fa", overlay: "rgba(0,151,167,0.06)", overlayHover: "rgba(0,151,167,0.1)", error: "#ef5350", success: "#66bb6a" },
    },
  },

  forest: {
    meta: { name: "Forest", emoji: "🌲", group: "skin", animation: "leaves" },
    dark: {
      "primary-color": "#66bb6a", "primary-hover": "#4caf50", "secondary-color": "#a5d6a7",
      "danger-color": "#ef5350", "success-color": "#81c784",
      "bg-primary": "#0d1a0d", "bg-secondary": "#1a2e1a", "bg-tertiary": "#234223",
      "bg-card": "#234223", "bg-card-hover": "#2e562e",
      "text-primary": "#e8f5e9", "text-secondary": "#a5d6a7", "text-muted": "#66bb6a",
      "border-color": "#2e562e", "border-light": "#3a6b3a",
    },
    light: {
      "primary-color": "#388e3c", "primary-hover": "#2e7d32", "secondary-color": "#4caf50",
      "danger-color": "#ef5350", "success-color": "#66bb6a",
      "bg-primary": "#e8f5e9", "bg-secondary": "#ffffff", "bg-tertiary": "#c8e6c9",
      "bg-card": "#ffffff", "bg-card-hover": "#e8f5e9",
      "text-primary": "#1b5e20", "text-secondary": "#2e7d32", "text-muted": "#66bb6a",
      "border-color": "#c8e6c9", "border-light": "#e8f5e9",
    },
    content: {
      dark: { primary: "#66bb6a", onPrimary: "#000000", onSurface: "#e8f5e9", onSurfaceVariant: "#a5d6a7", surface: "#0d1a0d", surfaceVariant: "#1a2e1a", outline: "#2e562e", outlineVariant: "#3a6b3a", overlay: "rgba(102,187,106,0.08)", overlayHover: "rgba(102,187,106,0.12)", error: "#ef5350", success: "#81c784" },
      light: { primary: "#388e3c", onPrimary: "#ffffff", onSurface: "#1b5e20", onSurfaceVariant: "#2e7d32", surface: "#e8f5e9", surfaceVariant: "#c8e6c9", outline: "#c8e6c9", outlineVariant: "#e8f5e9", overlay: "rgba(56,142,60,0.06)", overlayHover: "rgba(56,142,60,0.1)", error: "#ef5350", success: "#66bb6a" },
    },
  },

  sunset: {
    meta: { name: "Sunset", emoji: "🌅", group: "skin", animation: "shimmer" },
    dark: {
      "primary-color": "#ff7043", "primary-hover": "#ff5722", "secondary-color": "#ffab91",
      "danger-color": "#ef5350", "success-color": "#66bb6a",
      "bg-primary": "#1a0f0a", "bg-secondary": "#2d1a0f", "bg-tertiary": "#3e2415",
      "bg-card": "#3e2415", "bg-card-hover": "#4f2f1b",
      "text-primary": "#fbe9e7", "text-secondary": "#ffab91", "text-muted": "#ff8a65",
      "border-color": "#4f2f1b", "border-light": "#5d3a22",
    },
    light: {
      "primary-color": "#e64a19", "primary-hover": "#bf360c", "secondary-color": "#ff5722",
      "danger-color": "#ef5350", "success-color": "#66bb6a",
      "bg-primary": "#fbe9e7", "bg-secondary": "#ffffff", "bg-tertiary": "#ffccbc",
      "bg-card": "#ffffff", "bg-card-hover": "#fbe9e7",
      "text-primary": "#bf360c", "text-secondary": "#d84315", "text-muted": "#ff8a65",
      "border-color": "#ffccbc", "border-light": "#fbe9e7",
    },
    content: {
      dark: { primary: "#ff7043", onPrimary: "#000000", onSurface: "#fbe9e7", onSurfaceVariant: "#ffab91", surface: "#1a0f0a", surfaceVariant: "#2d1a0f", outline: "#4f2f1b", outlineVariant: "#5d3a22", overlay: "rgba(255,112,67,0.08)", overlayHover: "rgba(255,112,67,0.12)", error: "#ef5350", success: "#66bb6a" },
      light: { primary: "#e64a19", onPrimary: "#ffffff", onSurface: "#bf360c", onSurfaceVariant: "#d84315", surface: "#fbe9e7", surfaceVariant: "#ffccbc", outline: "#ffccbc", outlineVariant: "#fbe9e7", overlay: "rgba(230,74,25,0.06)", overlayHover: "rgba(230,74,25,0.1)", error: "#ef5350", success: "#66bb6a" },
    },
  },

  nord: {
    meta: { name: "Nord", emoji: "❄️", group: "skin", animation: "none" },
    dark: {
      "primary-color": "#88C0D0", "primary-hover": "#81A1C1", "secondary-color": "#81A1C1",
      "danger-color": "#BF616A", "success-color": "#A3BE8C",
      "bg-primary": "#2E3440", "bg-secondary": "#3B4252", "bg-tertiary": "#434C5E",
      "bg-card": "#434C5E", "bg-card-hover": "#4C566A",
      "text-primary": "#ECEFF4", "text-secondary": "#D8DEE9", "text-muted": "#B0BEC5",
      "border-color": "#4C566A", "border-light": "#5E6E82",
    },
    light: {
      "primary-color": "#5E81AC", "primary-hover": "#4C6FA5", "secondary-color": "#81A1C1",
      "danger-color": "#BF616A", "success-color": "#A3BE8C",
      "bg-primary": "#ECEFF4", "bg-secondary": "#E5E9F0", "bg-tertiary": "#D8DEE9",
      "bg-card": "#FFFFFF", "bg-card-hover": "#ECEFF4",
      "text-primary": "#2E3440", "text-secondary": "#3B4252", "text-muted": "#4C566A",
      "border-color": "#D8DEE9", "border-light": "#E5E9F0",
    },
    content: {
      dark: { primary: "#88C0D0", onPrimary: "#2E3440", onSurface: "#ECEFF4", onSurfaceVariant: "#D8DEE9", surface: "#2E3440", surfaceVariant: "#3B4252", outline: "#4C566A", outlineVariant: "#5E6E82", overlay: "rgba(136,192,208,0.08)", overlayHover: "rgba(136,192,208,0.12)", error: "#BF616A", success: "#A3BE8C" },
      light: { primary: "#5E81AC", onPrimary: "#FFFFFF", onSurface: "#2E3440", onSurfaceVariant: "#3B4252", surface: "#ECEFF4", surfaceVariant: "#E5E9F0", outline: "#D8DEE9", outlineVariant: "#E5E9F0", overlay: "rgba(94,129,172,0.06)", overlayHover: "rgba(94,129,172,0.10)", error: "#BF616A", success: "#A3BE8C" },
    },
  },

  dracula: {
    meta: { name: "Dracula", emoji: "🧛", group: "skin", animation: "none" },
    dark: {
      "primary-color": "#BD93F9", "primary-hover": "#FF79C6", "secondary-color": "#6272A4",
      "danger-color": "#FF5555", "success-color": "#50FA7B",
      "bg-primary": "#282A36", "bg-secondary": "#1E1F29", "bg-tertiary": "#373844",
      "bg-card": "#373844", "bg-card-hover": "#44475A",
      "text-primary": "#F8F8F2", "text-secondary": "#CFCFE2", "text-muted": "#6272A4",
      "border-color": "#44475A", "border-light": "#565869",
    },
    light: {
      "primary-color": "#7B5EA7", "primary-hover": "#C3417A", "secondary-color": "#6272A4",
      "danger-color": "#FF5555", "success-color": "#50FA7B",
      "bg-primary": "#F8F8F2", "bg-secondary": "#FFFFFF", "bg-tertiary": "#EEEEEE",
      "bg-card": "#FFFFFF", "bg-card-hover": "#F8F8F2",
      "text-primary": "#282A36", "text-secondary": "#44475A", "text-muted": "#6272A4",
      "border-color": "#DDDDEE", "border-light": "#EEEEEE",
    },
    content: {
      dark: { primary: "#BD93F9", onPrimary: "#282A36", onSurface: "#F8F8F2", onSurfaceVariant: "#CFCFE2", surface: "#282A36", surfaceVariant: "#44475A", outline: "#44475A", outlineVariant: "#565869", overlay: "rgba(189,147,249,0.08)", overlayHover: "rgba(189,147,249,0.12)", error: "#FF5555", success: "#50FA7B" },
      light: { primary: "#7B5EA7", onPrimary: "#FFFFFF", onSurface: "#282A36", onSurfaceVariant: "#44475A", surface: "#F8F8F2", surfaceVariant: "#EEEEEE", outline: "#DDDDEE", outlineVariant: "#EEEEEE", overlay: "rgba(123,94,167,0.06)", overlayHover: "rgba(123,94,167,0.10)", error: "#FF5555", success: "#50FA7B" },
    },
  },

  "solarized-dark": {
    meta: { name: "Solarized", emoji: "🌞", group: "skin", animation: "none" },
    dark: {
      "primary-color": "#268BD2", "primary-hover": "#2AA198", "secondary-color": "#839496",
      "danger-color": "#DC322F", "success-color": "#859900",
      "bg-primary": "#002B36", "bg-secondary": "#073642", "bg-tertiary": "#0D4252",
      "bg-card": "#0D4252", "bg-card-hover": "#1A506A",
      "text-primary": "#FDF6E3", "text-secondary": "#EEE8D5", "text-muted": "#839496",
      "border-color": "#1A506A", "border-light": "#266172",
    },
    light: {
      "primary-color": "#268BD2", "primary-hover": "#2AA198", "secondary-color": "#657B83",
      "danger-color": "#DC322F", "success-color": "#859900",
      "bg-primary": "#FDF6E3", "bg-secondary": "#EEE8D5", "bg-tertiary": "#E1D7C4",
      "bg-card": "#FFFFFF", "bg-card-hover": "#FDF6E3",
      "text-primary": "#073642", "text-secondary": "#586E75", "text-muted": "#93A1A1",
      "border-color": "#E1D7C4", "border-light": "#EEE8D5",
    },
    content: {
      dark: { primary: "#268BD2", onPrimary: "#002B36", onSurface: "#FDF6E3", onSurfaceVariant: "#EEE8D5", surface: "#002B36", surfaceVariant: "#073642", outline: "#1A506A", outlineVariant: "#266172", overlay: "rgba(38,139,210,0.08)", overlayHover: "rgba(38,139,210,0.12)", error: "#DC322F", success: "#859900" },
      light: { primary: "#268BD2", onPrimary: "#FFFFFF", onSurface: "#073642", onSurfaceVariant: "#586E75", surface: "#FDF6E3", surfaceVariant: "#EEE8D5", outline: "#E1D7C4", outlineVariant: "#EEE8D5", overlay: "rgba(38,139,210,0.06)", overlayHover: "rgba(38,139,210,0.10)", error: "#DC322F", success: "#859900" },
    },
  },

  cyberpunk: {
    meta: { name: "Cyberpunk", emoji: "🌆", group: "skin", animation: "none" },
    dark: {
      "primary-color": "#FF007F", "primary-hover": "#E0006E", "secondary-color": "#00FFCC",
      "danger-color": "#FF3333", "success-color": "#00FFCC",
      "bg-primary": "#0A0A12", "bg-secondary": "#12121E", "bg-tertiary": "#1A1A2A",
      "bg-card": "#1A1A2A", "bg-card-hover": "#222236",
      "text-primary": "#F0F0FF", "text-secondary": "#AAAACC", "text-muted": "#6666AA",
      "border-color": "#2A2A45", "border-light": "#333355",
    },
    light: {
      "primary-color": "#CC0066", "primary-hover": "#AA0055", "secondary-color": "#007766",
      "danger-color": "#CC0000", "success-color": "#007755",
      "bg-primary": "#F0F0FF", "bg-secondary": "#FFFFFF", "bg-tertiary": "#EAEAF8",
      "bg-card": "#FFFFFF", "bg-card-hover": "#F0F0FF",
      "text-primary": "#0A0A20", "text-secondary": "#222244", "text-muted": "#555588",
      "border-color": "#DDDDF0", "border-light": "#EEEEFF",
    },
    content: {
      dark: { primary: "#FF007F", onPrimary: "#0A0A12", onSurface: "#F0F0FF", onSurfaceVariant: "#AAAACC", surface: "#0A0A12", surfaceVariant: "#1A1A2A", outline: "#2A2A45", outlineVariant: "#333355", overlay: "rgba(255,0,127,0.08)", overlayHover: "rgba(255,0,127,0.14)", error: "#FF3333", success: "#00FFCC" },
      light: { primary: "#CC0066", onPrimary: "#FFFFFF", onSurface: "#0A0A20", onSurfaceVariant: "#222244", surface: "#F0F0FF", surfaceVariant: "#EAEAF8", outline: "#DDDDF0", outlineVariant: "#EEEEFF", overlay: "rgba(204,0,102,0.06)", overlayHover: "rgba(204,0,102,0.10)", error: "#CC0000", success: "#007755" },
    },
  },

  "rose-gold": {
    meta: { name: "Rose Gold", emoji: "🌸", group: "skin", animation: "none" },
    dark: {
      "primary-color": "#E8A0BF", "primary-hover": "#D4849F", "secondary-color": "#C9A0B8",
      "danger-color": "#E05070", "success-color": "#80C880",
      "bg-primary": "#1A0F14", "bg-secondary": "#261520", "bg-tertiary": "#341B2C",
      "bg-card": "#341B2C", "bg-card-hover": "#402238",
      "text-primary": "#FFF0F5", "text-secondary": "#EECCD8", "text-muted": "#C09090",
      "border-color": "#4A2438", "border-light": "#5C2E48",
    },
    light: {
      "primary-color": "#C06080", "primary-hover": "#A84A6A", "secondary-color": "#A07080",
      "danger-color": "#CC3355", "success-color": "#559955",
      "bg-primary": "#FFF0F5", "bg-secondary": "#FFFFFF", "bg-tertiary": "#FFE0EC",
      "bg-card": "#FFFFFF", "bg-card-hover": "#FFF0F5",
      "text-primary": "#3A0F1A", "text-secondary": "#5C2034", "text-muted": "#A06070",
      "border-color": "#FFCCDD", "border-light": "#FFDDEE",
    },
    content: {
      dark: { primary: "#E8A0BF", onPrimary: "#1A0F14", onSurface: "#FFF0F5", onSurfaceVariant: "#EECCD8", surface: "#1A0F14", surfaceVariant: "#341B2C", outline: "#4A2438", outlineVariant: "#5C2E48", overlay: "rgba(232,160,191,0.08)", overlayHover: "rgba(232,160,191,0.12)", error: "#E05070", success: "#80C880" },
      light: { primary: "#C06080", onPrimary: "#FFFFFF", onSurface: "#3A0F1A", onSurfaceVariant: "#5C2034", surface: "#FFF0F5", surfaceVariant: "#FFE0EC", outline: "#FFCCDD", outlineVariant: "#FFDDEE", overlay: "rgba(192,96,128,0.06)", overlayHover: "rgba(192,96,128,0.10)", error: "#CC3355", success: "#559955" },
    },
  },

  "ayu-mirage": {
    meta: { name: "Ayu Mirage", emoji: "🏜️", group: "skin", animation: "none" },
    dark: {
      "primary-color": "#FFB454", "primary-hover": "#E8A040", "secondary-color": "#95E6CB",
      "danger-color": "#F28779", "success-color": "#87D96C",
      "bg-primary": "#1F2430", "bg-secondary": "#242B38", "bg-tertiary": "#2D3446",
      "bg-card": "#2D3446", "bg-card-hover": "#383F52",
      "text-primary": "#CBCCC6", "text-secondary": "#B0B6C8", "text-muted": "#707A8C",
      "border-color": "#383F52", "border-light": "#424A60",
    },
    light: {
      "primary-color": "#D07040", "primary-hover": "#B85E30", "secondary-color": "#4C8A70",
      "danger-color": "#CC5544", "success-color": "#4D9942",
      "bg-primary": "#FAFAFA", "bg-secondary": "#FFFFFF", "bg-tertiary": "#F0F0F0",
      "bg-card": "#FFFFFF", "bg-card-hover": "#FAFAFA",
      "text-primary": "#1A1A2A", "text-secondary": "#3A3A50", "text-muted": "#7070A0",
      "border-color": "#E0E0EC", "border-light": "#EEEEEE",
    },
    content: {
      dark: { primary: "#FFB454", onPrimary: "#1F2430", onSurface: "#CBCCC6", onSurfaceVariant: "#B0B6C8", surface: "#1F2430", surfaceVariant: "#2D3446", outline: "#383F52", outlineVariant: "#424A60", overlay: "rgba(255,180,84,0.08)", overlayHover: "rgba(255,180,84,0.12)", error: "#F28779", success: "#87D96C" },
      light: { primary: "#D07040", onPrimary: "#FFFFFF", onSurface: "#1A1A2A", onSurfaceVariant: "#3A3A50", surface: "#FAFAFA", surfaceVariant: "#F0F0F0", outline: "#E0E0EC", outlineVariant: "#EEEEEE", overlay: "rgba(208,112,64,0.06)", overlayHover: "rgba(208,112,64,0.10)", error: "#CC5544", success: "#4D9942" },
    },
  },

  "high-contrast": {
    meta: { name: "High Contrast", emoji: "⬛", group: "skin", animation: "none" },
    dark: {
      "primary-color": "#FFFF00", "primary-hover": "#E0E000", "secondary-color": "#00FFFF",
      "danger-color": "#FF4444", "success-color": "#44FF44",
      "bg-primary": "#000000", "bg-secondary": "#0A0A0A", "bg-tertiary": "#111111",
      "bg-card": "#111111", "bg-card-hover": "#1A1A1A",
      "text-primary": "#FFFFFF", "text-secondary": "#EEEEEE", "text-muted": "#CCCCCC",
      "border-color": "#444444", "border-light": "#555555",
    },
    light: {
      "primary-color": "#0000CC", "primary-hover": "#000099", "secondary-color": "#006666",
      "danger-color": "#CC0000", "success-color": "#007700",
      "bg-primary": "#FFFFFF", "bg-secondary": "#F5F5F5", "bg-tertiary": "#EEEEEE",
      "bg-card": "#FFFFFF", "bg-card-hover": "#F5F5F5",
      "text-primary": "#000000", "text-secondary": "#111111", "text-muted": "#333333",
      "border-color": "#AAAAAA", "border-light": "#CCCCCC",
    },
    content: {
      dark: { primary: "#FFFF00", onPrimary: "#000000", onSurface: "#FFFFFF", onSurfaceVariant: "#EEEEEE", surface: "#000000", surfaceVariant: "#111111", outline: "#444444", outlineVariant: "#555555", overlay: "rgba(255,255,0,0.10)", overlayHover: "rgba(255,255,0,0.18)", error: "#FF4444", success: "#44FF44" },
      light: { primary: "#0000CC", onPrimary: "#FFFFFF", onSurface: "#000000", onSurfaceVariant: "#111111", surface: "#FFFFFF", surfaceVariant: "#EEEEEE", outline: "#AAAAAA", outlineVariant: "#CCCCCC", overlay: "rgba(0,0,204,0.06)", overlayHover: "rgba(0,0,204,0.12)", error: "#CC0000", success: "#007700" },
    },
  },

  "sepia-reader": {
    meta: { name: "Sepia Reader", emoji: "📜", group: "skin", animation: "none" },
    dark: {
      "primary-color": "#d4a574", "primary-hover": "#c4915e", "secondary-color": "#bfa882",
      "danger-color": "#e57373", "success-color": "#81c784",
      "bg-primary": "#1a150e", "bg-secondary": "#2a2118", "bg-tertiary": "#3a2e22",
      "bg-card": "#3a2e22", "bg-card-hover": "#4a3c2e",
      "text-primary": "#f5e6d3", "text-secondary": "#d4bfa0", "text-muted": "#a89070",
      "border-color": "#4a3c2e", "border-light": "#5a4a3a",
    },
    light: {
      "primary-color": "#8d6e63", "primary-hover": "#795548", "secondary-color": "#a1887f",
      "danger-color": "#e57373", "success-color": "#81c784",
      "bg-primary": "#faf0e6", "bg-secondary": "#fff8f0", "bg-tertiary": "#f0e0d0",
      "bg-card": "#fff8f0", "bg-card-hover": "#faf0e6",
      "text-primary": "#3e2723", "text-secondary": "#5d4037", "text-muted": "#8d6e63",
      "border-color": "#d7ccc8", "border-light": "#efebe9",
    },
    content: {
      dark: { primary: "#d4a574", onPrimary: "#000000", onSurface: "#f5e6d3", onSurfaceVariant: "#d4bfa0", surface: "#1a150e", surfaceVariant: "#2a2118", outline: "#4a3c2e", outlineVariant: "#5a4a3a", overlay: "rgba(212,165,116,0.08)", overlayHover: "rgba(212,165,116,0.12)", error: "#e57373", success: "#81c784" },
      light: { primary: "#8d6e63", onPrimary: "#ffffff", onSurface: "#3e2723", onSurfaceVariant: "#5d4037", surface: "#faf0e6", surfaceVariant: "#f0e0d0", outline: "#d7ccc8", outlineVariant: "#efebe9", overlay: "rgba(141,110,99,0.06)", overlayHover: "rgba(141,110,99,0.1)", error: "#e57373", success: "#81c784" },
    },
  },

  "tokyo-night": {
    meta: { name: "Tokyo Night", emoji: "🗼", group: "creative", animation: "none", defaultMode: "dark" },
    dark: {
      "primary-color": "#7aa2f7", "primary-hover": "#2ac3de", "secondary-color": "#9aa5ce",
      "danger-color": "#f7768e", "success-color": "#9ece6a",
      "bg-primary": "#1a1b26", "bg-secondary": "#24283b", "bg-tertiary": "#292e42",
      "bg-card": "#292e42", "bg-card-hover": "#414868",
      "text-primary": "#c0caf5", "text-secondary": "#9aa5ce", "text-muted": "#565f89",
      "border-color": "#292e42", "border-light": "#414868",
    },
    light: {
      "primary-color": "#2e7de9", "primary-hover": "#188092", "secondary-color": "#8990b3",
      "danger-color": "#8c4351", "success-color": "#485e30",
      "bg-primary": "#d5d6db", "bg-secondary": "#e1e2e7", "bg-tertiary": "#cbccd1",
      "bg-card": "#e1e2e7", "bg-card-hover": "#d5d6db",
      "text-primary": "#343b58", "text-secondary": "#565f89", "text-muted": "#8990b3",
      "border-color": "#cbccd1", "border-light": "#e1e2e7",
    },
    content: {
      dark: { primary: "#7aa2f7", onPrimary: "#1a1b26", onSurface: "#c0caf5", onSurfaceVariant: "#9aa5ce", surface: "#1a1b26", surfaceVariant: "#24283b", outline: "#292e42", outlineVariant: "#414868", overlay: "rgba(122,162,247,0.08)", overlayHover: "rgba(122,162,247,0.14)", error: "#f7768e", success: "#9ece6a" },
      light: { primary: "#2e7de9", onPrimary: "#ffffff", onSurface: "#343b58", onSurfaceVariant: "#565f89", surface: "#d5d6db", surfaceVariant: "#e1e2e7", outline: "#cbccd1", outlineVariant: "#e1e2e7", overlay: "rgba(46,125,233,0.08)", overlayHover: "rgba(46,125,233,0.14)", error: "#8c4351", success: "#485e30" },
    },
  },

  "catppuccin-mocha": {
    meta: { name: "Catppuccin Mocha", emoji: "🌙", group: "creative", animation: "none", defaultMode: "dark" },
    dark: {
      "primary-color": "#cba6f7", "primary-hover": "#f5c2e7", "secondary-color": "#89b4fa",
      "danger-color": "#f38ba8", "success-color": "#a6e3a1",
      "bg-primary": "#1e1e2e", "bg-secondary": "#181825", "bg-tertiary": "#313244",
      "bg-card": "#313244", "bg-card-hover": "#45475a",
      "text-primary": "#cdd6f4", "text-secondary": "#a6adc8", "text-muted": "#6c7086",
      "border-color": "#313244", "border-light": "#45475a",
    },
    light: {
      "primary-color": "#7c3aed", "primary-hover": "#6d28d9", "secondary-color": "#1e66f5",
      "danger-color": "#dc2626", "success-color": "#16a34a",
      "bg-primary": "#eff1f5", "bg-secondary": "#e6e9ef", "bg-tertiary": "#dce0e8",
      "bg-card": "#e6e9ef", "bg-card-hover": "#dce0e8",
      "text-primary": "#4c4f69", "text-secondary": "#5c5f77", "text-muted": "#9ca0b0",
      "border-color": "#bcc0cc", "border-light": "#ccd0da",
    },
    content: {
      dark: { primary: "#cba6f7", onPrimary: "#1e1e2e", onSurface: "#cdd6f4", onSurfaceVariant: "#a6adc8", surface: "#1e1e2e", surfaceVariant: "#313244", outline: "#313244", outlineVariant: "#45475a", overlay: "rgba(203,166,247,0.08)", overlayHover: "rgba(203,166,247,0.14)", error: "#f38ba8", success: "#a6e3a1" },
      light: { primary: "#7c3aed", onPrimary: "#ffffff", onSurface: "#4c4f69", onSurfaceVariant: "#5c5f77", surface: "#eff1f5", surfaceVariant: "#e6e9ef", outline: "#bcc0cc", outlineVariant: "#ccd0da", overlay: "rgba(124,58,237,0.06)", overlayHover: "rgba(124,58,237,0.12)", error: "#dc2626", success: "#16a34a" },
    },
  },

  "catppuccin-latte": {
    meta: { name: "Catppuccin Latte", emoji: "☕", group: "creative", animation: "none", defaultMode: "light" },
    dark: {
      "primary-color": "#cba6f7", "primary-hover": "#f5c2e7", "secondary-color": "#89b4fa",
      "danger-color": "#f38ba8", "success-color": "#a6e3a1",
      "bg-primary": "#1e1e2e", "bg-secondary": "#181825", "bg-tertiary": "#313244",
      "bg-card": "#313244", "bg-card-hover": "#45475a",
      "text-primary": "#cdd6f4", "text-secondary": "#a6adc8", "text-muted": "#6c7086",
      "border-color": "#313244", "border-light": "#45475a",
    },
    light: {
      "primary-color": "#7c3aed", "primary-hover": "#6d28d9", "secondary-color": "#1e66f5",
      "danger-color": "#dc2626", "success-color": "#16a34a",
      "bg-primary": "#eff1f5", "bg-secondary": "#e6e9ef", "bg-tertiary": "#dce0e8",
      "bg-card": "#e6e9ef", "bg-card-hover": "#dce0e8",
      "text-primary": "#4c4f69", "text-secondary": "#5c5f77", "text-muted": "#9ca0b0",
      "border-color": "#bcc0cc", "border-light": "#ccd0da",
    },
    content: {
      dark: { primary: "#cba6f7", onPrimary: "#1e1e2e", onSurface: "#cdd6f4", onSurfaceVariant: "#a6adc8", surface: "#1e1e2e", surfaceVariant: "#313244", outline: "#313244", outlineVariant: "#45475a", overlay: "rgba(203,166,247,0.08)", overlayHover: "rgba(203,166,247,0.14)", error: "#f38ba8", success: "#a6e3a1" },
      light: { primary: "#7c3aed", onPrimary: "#ffffff", onSurface: "#4c4f69", onSurfaceVariant: "#5c5f77", surface: "#eff1f5", surfaceVariant: "#e6e9ef", outline: "#bcc0cc", outlineVariant: "#ccd0da", overlay: "rgba(124,58,237,0.06)", overlayHover: "rgba(124,58,237,0.12)", error: "#dc2626", success: "#16a34a" },
    },
  },

  synthwave: {
    meta: { name: "Synthwave", emoji: "🌆", group: "creative", animation: "none", defaultMode: "dark" },
    dark: {
      "primary-color": "#f92aad", "primary-hover": "#ff7efb", "secondary-color": "#79dded",
      "danger-color": "#ff5555", "success-color": "#50fa7b",
      "bg-primary": "#241734", "bg-secondary": "#2d1b4e", "bg-tertiary": "#1a0e2e",
      "bg-card": "#2d1b4e", "bg-card-hover": "#3d2570",
      "text-primary": "#f8f8f2", "text-secondary": "#e2c5f9", "text-muted": "#a991bc",
      "border-color": "#4a2671", "border-light": "#6a3691",
    },
    light: {
      "primary-color": "#c02a84", "primary-hover": "#9d0a64", "secondary-color": "#0e8fa6",
      "danger-color": "#dc2626", "success-color": "#16a34a",
      "bg-primary": "#f5f0ff", "bg-secondary": "#ede6ff", "bg-tertiary": "#ddd5f5",
      "bg-card": "#ede6ff", "bg-card-hover": "#ddd5f5",
      "text-primary": "#2d1b69", "text-secondary": "#4a2671", "text-muted": "#7c5cbf",
      "border-color": "#c4b5e8", "border-light": "#ddd5f5",
    },
    content: {
      dark: { primary: "#f92aad", onPrimary: "#ffffff", onSurface: "#f8f8f2", onSurfaceVariant: "#e2c5f9", surface: "#241734", surfaceVariant: "#2d1b4e", outline: "#4a2671", outlineVariant: "#6a3691", overlay: "rgba(249,42,173,0.08)", overlayHover: "rgba(249,42,173,0.16)", error: "#ff5555", success: "#50fa7b" },
      light: { primary: "#c02a84", onPrimary: "#ffffff", onSurface: "#2d1b69", onSurfaceVariant: "#4a2671", surface: "#f5f0ff", surfaceVariant: "#ede6ff", outline: "#c4b5e8", outlineVariant: "#ddd5f5", overlay: "rgba(192,42,132,0.06)", overlayHover: "rgba(192,42,132,0.12)", error: "#dc2626", success: "#16a34a" },
    },
  },

  gruvbox: {
    meta: { name: "Gruvbox", emoji: "🪵", group: "creative", animation: "none", defaultMode: "dark" },
    dark: {
      "primary-color": "#fe8019", "primary-hover": "#fabd2f", "secondary-color": "#83a598",
      "danger-color": "#fb4934", "success-color": "#b8bb26",
      "bg-primary": "#282828", "bg-secondary": "#3c3836", "bg-tertiary": "#504945",
      "bg-card": "#3c3836", "bg-card-hover": "#504945",
      "text-primary": "#ebdbb2", "text-secondary": "#d5c4a1", "text-muted": "#928374",
      "border-color": "#504945", "border-light": "#665c54",
    },
    light: {
      "primary-color": "#af3a03", "primary-hover": "#b57614", "secondary-color": "#427b58",
      "danger-color": "#9d0006", "success-color": "#79740e",
      "bg-primary": "#fbf1c7", "bg-secondary": "#f9f5d7", "bg-tertiary": "#f2e5bc",
      "bg-card": "#f9f5d7", "bg-card-hover": "#ebdbb2",
      "text-primary": "#3c3836", "text-secondary": "#504945", "text-muted": "#7c6f64",
      "border-color": "#d5c4a1", "border-light": "#ebdbb2",
    },
    content: {
      dark: { primary: "#fe8019", onPrimary: "#282828", onSurface: "#ebdbb2", onSurfaceVariant: "#d5c4a1", surface: "#282828", surfaceVariant: "#3c3836", outline: "#504945", outlineVariant: "#665c54", overlay: "rgba(254,128,25,0.08)", overlayHover: "rgba(254,128,25,0.14)", error: "#fb4934", success: "#b8bb26" },
      light: { primary: "#af3a03", onPrimary: "#ffffff", onSurface: "#3c3836", onSurfaceVariant: "#504945", surface: "#fbf1c7", surfaceVariant: "#f2e5bc", outline: "#d5c4a1", outlineVariant: "#ebdbb2", overlay: "rgba(175,58,3,0.06)", overlayHover: "rgba(175,58,3,0.12)", error: "#9d0006", success: "#79740e" },
    },
  },

  "nord-snow": {
    meta: { name: "Nord Snow", emoji: "🏔️", group: "creative", animation: "none", defaultMode: "light" },
    dark: {
      "primary-color": "#88c0d0", "primary-hover": "#81a1c1", "secondary-color": "#5e81ac",
      "danger-color": "#bf616a", "success-color": "#a3be8c",
      "bg-primary": "#2e3440", "bg-secondary": "#3b4252", "bg-tertiary": "#434c5e",
      "bg-card": "#434c5e", "bg-card-hover": "#4c566a",
      "text-primary": "#eceff4", "text-secondary": "#d8dee9", "text-muted": "#8d98aa",
      "border-color": "#434c5e", "border-light": "#4c566a",
    },
    light: {
      "primary-color": "#5e81ac", "primary-hover": "#4c6f96", "secondary-color": "#88c0d0",
      "danger-color": "#bf616a", "success-color": "#a3be8c",
      "bg-primary": "#eceff4", "bg-secondary": "#e5e9f0", "bg-tertiary": "#d8dee9",
      "bg-card": "#e5e9f0", "bg-card-hover": "#d8dee9",
      "text-primary": "#2e3440", "text-secondary": "#3b4252", "text-muted": "#4c566a",
      "border-color": "#d8dee9", "border-light": "#e5e9f0",
    },
    content: {
      dark: { primary: "#88c0d0", onPrimary: "#2e3440", onSurface: "#eceff4", onSurfaceVariant: "#d8dee9", surface: "#2e3440", surfaceVariant: "#3b4252", outline: "#434c5e", outlineVariant: "#4c566a", overlay: "rgba(136,192,208,0.08)", overlayHover: "rgba(136,192,208,0.14)", error: "#bf616a", success: "#a3be8c" },
      light: { primary: "#5e81ac", onPrimary: "#ffffff", onSurface: "#2e3440", onSurfaceVariant: "#3b4252", surface: "#eceff4", surfaceVariant: "#e5e9f0", outline: "#d8dee9", outlineVariant: "#e5e9f0", overlay: "rgba(94,129,172,0.06)", overlayHover: "rgba(94,129,172,0.12)", error: "#bf616a", success: "#a3be8c" },
    },
  },

  "github-light": {
    meta: { name: "GitHub", emoji: "🐙", group: "creative", animation: "none", defaultMode: "light" },
    dark: {
      "primary-color": "#2f81f7", "primary-hover": "#388bfd", "secondary-color": "#58a6ff",
      "danger-color": "#f85149", "success-color": "#3fb950",
      "bg-primary": "#0d1117", "bg-secondary": "#161b22", "bg-tertiary": "#21262d",
      "bg-card": "#21262d", "bg-card-hover": "#292f37",
      "text-primary": "#e6edf3", "text-secondary": "#8b949e", "text-muted": "#484f58",
      "border-color": "#30363d", "border-light": "#21262d",
    },
    light: {
      "primary-color": "#0969da", "primary-hover": "#0550ae", "secondary-color": "#1a7f37",
      "danger-color": "#d1242f", "success-color": "#1a7f37",
      "bg-primary": "#ffffff", "bg-secondary": "#f6f8fa", "bg-tertiary": "#eaeef2",
      "bg-card": "#ffffff", "bg-card-hover": "#f6f8fa",
      "text-primary": "#1f2328", "text-secondary": "#636c76", "text-muted": "#9198a1",
      "border-color": "#d0d7de", "border-light": "#d8dee4",
    },
    content: {
      dark: { primary: "#2f81f7", onPrimary: "#ffffff", onSurface: "#e6edf3", onSurfaceVariant: "#8b949e", surface: "#0d1117", surfaceVariant: "#161b22", outline: "#30363d", outlineVariant: "#21262d", overlay: "rgba(47,129,247,0.08)", overlayHover: "rgba(47,129,247,0.14)", error: "#f85149", success: "#3fb950" },
      light: { primary: "#0969da", onPrimary: "#ffffff", onSurface: "#1f2328", onSurfaceVariant: "#636c76", surface: "#ffffff", surfaceVariant: "#f6f8fa", outline: "#d0d7de", outlineVariant: "#d8dee4", overlay: "rgba(9,105,218,0.06)", overlayHover: "rgba(9,105,218,0.12)", error: "#d1242f", success: "#1a7f37" },
    },
  },
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function adjustHexBrightness(hex, amount) {
  if (!/^#([0-9A-Fa-f]{6})$/.test(hex || "")) return hex;
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp(parseInt(hex.slice(1, 3), 16) + amount);
  const g = clamp(parseInt(hex.slice(3, 5), 16) + amount);
  const b = clamp(parseInt(hex.slice(5, 7), 16) + amount);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function hexToRgba(hex, alpha = 0.8) {
  if (!/^#([0-9A-Fa-f]{6})$/.test(hex || "")) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function _inSchedule(start, end) {
  try {
    const now = new Date();
    const toMins = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
    const cur = now.getHours() * 60 + now.getMinutes();
    const s = toMins(start || "06:00");
    const e = toMins(end || "18:00");
    return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
  } catch (_) { return false; }
}

function _getSunriseSunsetHours() {
  try {
    const tz = typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone || "" : "";
    const southern = /^(America\/(Sao_Paulo|Argentina)|Australia|Pacific\/(Auckland|Fiji)|Africa\/(Johannesburg|Nairobi))/i.test(tz);
    const month = new Date().getMonth();
    const summerMonth = southern ? 11 : 5;
    const monthDiff = Math.abs(((month - summerMonth + 18) % 12) - 6) / 6;
    const rise = 6 - monthDiff * 1.5;
    const set = 18 + monthDiff * 2;
    return [Math.max(4, rise), Math.min(21, set)];
  } catch (_) { return [6, 18]; }
}

// ─────────────────────────────────────────────────────────────
// Core API
// ─────────────────────────────────────────────────────────────

export function resolveMode(mode, themeSettings = {}) {
  if (mode === "light") return "light";
  if (mode === "auto") {
    const behavior = themeSettings?.autoBehavior || "system";
    if (behavior === "schedule") {
      return _inSchedule(themeSettings?.timeCustomStart || "06:00", themeSettings?.timeCustomEnd || "18:00") ? "light" : "dark";
    }
    if (behavior === "sun") {
      const [rise, set] = _getSunriseSunsetHours();
      const nowH = new Date().getHours() + new Date().getMinutes() / 60;
      return nowH >= rise && nowH < set ? "light" : "dark";
    }
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  }
  return "dark";
}

export function getThemePalette(theme) {
  const builtInKey = theme?.basePreset || theme?.preset || "material-dark";
  const preset = THEME_PRESETS[builtInKey] || THEME_PRESETS["material-dark"];
  const effectiveMode = resolveMode(theme?.mode || "dark", theme);
  const palette = { ...(preset[effectiveMode] || preset.dark) };

  const skipOverrides = theme?.mode === "auto" && (theme?.autoBehavior === "sun" || theme?.autoBehavior === "schedule");
  if (!skipOverrides) {
    if (theme?.accentPrimary) palette["primary-color"] = theme.accentPrimary;
    if (theme?.accentSecondary) palette["primary-hover"] = theme.accentSecondary;
    if (theme?.bgColor) {
      palette["bg-primary"] = theme.bgColor;
      if (!theme?.bgSecondary) { palette["bg-secondary"] = adjustHexBrightness(theme.bgColor, 10); palette["bg-card"] = adjustHexBrightness(theme.bgColor, 20); }
      if (!theme?.bgTertiary) palette["bg-tertiary"] = adjustHexBrightness(theme.bgColor, 20);
    }
    if (theme?.bgSecondary) { palette["bg-secondary"] = theme.bgSecondary; palette["bg-card"] = theme.bgSecondary; }
    if (theme?.bgTertiary) { palette["bg-tertiary"] = theme.bgTertiary; palette["bg-card"] = theme.bgTertiary; }
    if (theme?.textColor) palette["text-primary"] = theme.textColor;
  }
  return palette;
}

export function getContentThemeColors(theme) {
  const preset = THEME_PRESETS[theme?.preset] || THEME_PRESETS["material-dark"];
  const effectiveMode = resolveMode(theme?.mode || "dark", theme);
  return { ...(preset.content?.[effectiveMode] || preset.content?.dark || THEME_PRESETS["material-dark"].content.dark) };
}

export function setThemeVariables(theme) {
  const root = document.documentElement;
  const effectiveMode = resolveMode(theme?.mode || "dark", theme);
  const palette = getThemePalette(theme);

  if (effectiveMode === "light") { root.setAttribute("data-theme", "light"); } else { root.removeAttribute("data-theme"); }
  root.setAttribute("data-theme-preset", theme?.preset || "material-dark");

  if (typeof window !== "undefined" && window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (window.__clOSThemeFn) { try { mq.removeEventListener("change", window.__clOSThemeFn); } catch (_) {} window.__clOSThemeFn = null; }
    if (theme?.mode === "auto" && (!theme?.autoBehavior || theme?.autoBehavior === "system")) {
      window.__clOSThemeFn = () => applyThemeFromStorage();
      mq.addEventListener("change", window.__clOSThemeFn);
    }
  }

  if (typeof window !== "undefined") {
    if (window.__clTimerHandle) { clearInterval(window.__clTimerHandle); window.__clTimerHandle = null; }
    if (theme?.mode === "auto" && (theme?.autoBehavior === "sun" || theme?.autoBehavior === "schedule")) {
      window.__clTimerHandle = setInterval(() => applyThemeFromStorage(), 60000);
    }
  }

  Object.entries(palette).forEach(([key, value]) => { root.style.setProperty(`--${key}`, value); });

  // CodeLedger-specific --cl-* aliases
  root.style.setProperty("--cl-accent", palette["primary-color"]);
  root.style.setProperty("--cl-accent-hover", palette["primary-hover"] || palette["primary-color"]);
  root.style.setProperty("--cl-bg", palette["bg-primary"]);
  root.style.setProperty("--cl-surface", palette["bg-secondary"] || palette["bg-primary"]);
  root.style.setProperty("--cl-card", palette["bg-card"] || palette["bg-tertiary"]);
  root.style.setProperty("--cl-text", palette["text-primary"]);
  root.style.setProperty("--cl-text-muted", palette["text-muted"] || palette["text-secondary"]);
  root.style.setProperty("--cl-border", palette["border-color"]);

  // Derived aliases for legacy code
  root.style.setProperty("--accent-primary", palette["primary-color"]);
  root.style.setProperty("--accent-secondary", palette["primary-hover"]);
  root.style.setProperty("--container-bg", palette["bg-secondary"] || palette["bg-primary"]);
  root.style.setProperty("--text-primary", palette["text-primary"]);
  root.style.setProperty("--text-muted", palette["text-muted"] || palette["text-secondary"]);
}

export async function applyThemeFromStorage() {
  let theme = DEFAULT_THEME;
  try {
    const stored = await Storage.getTheme();
    if (stored) theme = stored;
  } catch (_) {}
  setThemeVariables(theme);
  return theme;
}

export function setupThemeListener() {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes["ui.theme"]) return;
    setThemeVariables(changes["ui.theme"].newValue || DEFAULT_THEME);
  });
}

export function getPresetList(customPresets = {}) {
  const builtIn = Object.entries(THEME_PRESETS).map(([id, preset]) => ({
    id, name: preset.meta.name, emoji: preset.meta.emoji, group: preset.meta.group, custom: false,
  }));
  const custom = Object.entries(customPresets || {}).map(([id, preset]) => ({
    id, name: preset.name || id, emoji: preset.emoji || "🎨", group: "custom", custom: true,
  }));
  return [...builtIn, ...custom];
}

export default { DEFAULT_THEME, THEME_PRESETS, resolveMode, getThemePalette, getContentThemeColors, setThemeVariables, applyThemeFromStorage, setupThemeListener, getPresetList, hexToRgba };
