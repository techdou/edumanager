<template>
  <router-view />
</template>

<script setup>
</script>

<style>
/* ====== Design Tokens ====== */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Sora:wght@400;600;700&display=swap');

:root {
  /* Color System - OKLCH */
  --color-bg: #faf9f7;
  --color-surface: #ffffff;
  --color-surface-elevated: #ffffff;
  --color-ink: #1a1a1a;
  --color-ink-secondary: oklch(0.45 0.02 260);
  --color-ink-tertiary: oklch(0.6 0.01 260);
  --color-muted: oklch(0.85 0.01 260);
  --color-border: oklch(0.88 0.01 260);
  
  /* Primary - Warm blue */
  --color-primary: oklch(0.55 0.18 250);
  --color-primary-hover: oklch(0.5 0.2 250);
  --color-primary-subtle: oklch(0.95 0.04 250);
  
  /* Semantic */
  --color-success: oklch(0.55 0.18 145);
  --color-warning: oklch(0.7 0.15 85);
  --color-error: oklch(0.55 0.22 25);
  --color-error-subtle: oklch(0.95 0.05 25);
  
  /* Spacing - 8px base */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  
  /* Typography */
  --font-sans: 'DM Sans', system-ui, sans-serif;
  --font-display: 'Sora', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 32px;
  --text-4xl: 40px;
  
  /* Radii */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  
  /* Shadows - layered */
  --shadow-sm: 0 1px 2px oklch(0.2 0 0 / 0.05);
  --shadow-md: 0 4px 12px oklch(0.2 0 0 / 0.08);
  --shadow-lg: 0 8px 24px oklch(0.2 0 0 / 0.1);
  
  /* Motion */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;
}

/* ====== Reset & Base ====== */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-sans);
  background: var(--color-bg);
  color: var(--color-ink);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ====== Component Primitives ====== */

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-expo);
  position: relative;
  overflow: hidden;
}

.btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: oklch(1 0 0 / 0);
  transition: background var(--duration-fast) var(--ease-out-expo);
}

.btn:hover::after {
  background: oklch(1 0 0 / 0.08);
}

.btn:active {
  transform: translateY(1px);
}

.btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

.btn-secondary {
  background: var(--color-surface);
  color: var(--color-ink-secondary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-bg);
  border-color: var(--color-muted);
}

.btn-ghost {
  background: transparent;
  color: var(--color-ink-secondary);
}

.btn-ghost:hover {
  background: var(--color-bg);
}

.btn-danger {
  background: var(--color-error);
  color: white;
}

/* Cards */
.card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  transition: box-shadow var(--duration-normal) var(--ease-out-expo);
}

.card:hover {
  box-shadow: var(--shadow-md);
}

/* Inputs */
.input {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  color: var(--color-ink);
  background: var(--color-surface);
  transition: border-color var(--duration-fast) var(--ease-out-expo),
              box-shadow var(--duration-fast) var(--ease-out-expo);
}

.input::placeholder {
  color: var(--color-ink-tertiary);
}

.input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-subtle);
  outline: none;
}

.input:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Links */
.link {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 500;
  transition: color var(--duration-fast) var(--ease-out-expo);
  position: relative;
}

.link::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 1.5px;
  background: var(--color-primary);
  transition: width var(--duration-normal) var(--ease-out-expo);
}

.link:hover::after {
  width: 100%;
}

/* Pills / Tags */
.pill {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
  background: var(--color-bg);
  color: var(--color-ink-secondary);
  border: 1px solid var(--color-border);
  transition: all var(--duration-fast) var(--ease-out-expo);
}

.pill:hover {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.pill.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

/* Skeleton Loading */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-bg) 25%,
    oklch(0.92 0.01 260) 50%,
    var(--color-bg) 75%
  );
  background-size: 200% 100%;
  border-radius: var(--radius-md);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-16) var(--space-8);
  text-align: center;
  color: var(--color-ink-tertiary);
}

.empty-state-icon {
  font-size: var(--text-4xl);
  margin-bottom: var(--space-4);
  opacity: 0.5;
}

.empty-state-title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-ink-secondary);
  margin-bottom: var(--space-2);
}

.empty-state-desc {
  font-size: var(--text-sm);
  max-width: 400px;
  line-height: 1.6;
}

.empty-state-action {
  margin-top: var(--space-6);
}

/* Error State */
.error-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-error-subtle);
  border: 1px solid oklch(0.85 0.05 25);
  color: var(--color-error);
  font-size: var(--text-sm);
}

/* Divider */
.divider {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  color: var(--color-ink-tertiary);
  font-size: var(--text-sm);
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

/* Layout utilities */
.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 var(--space-6);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .skeleton {
    animation: none;
    background: var(--color-bg);
  }
}
</style>