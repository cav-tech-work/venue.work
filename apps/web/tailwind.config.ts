import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        surface: "#09090b",
        card: "#0d0d10",
        border: "#1e1e24",
        "border-subtle": "#14141a",
        "text-primary": "#f4f4f5",
        "text-secondary": "#a1a1aa",
        "text-muted": "#52525b",
        accent: {
          DEFAULT: "#6366f1",
          dim: "#4f46e5",
          glow: "rgba(99,102,241,0.15)",
        },
        cyan: {
          glow: "rgba(34,211,238,0.12)",
          DEFAULT: "#22d3ee",
          dim: "#0891b2",
        },
        amber: {
          glow: "rgba(251,191,36,0.10)",
          DEFAULT: "#fbbf24",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "monospace"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        "radial-fade":
          "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 70%)",
        "scan-line":
          "linear-gradient(180deg, transparent 0%, rgba(99,102,241,0.04) 50%, transparent 100%)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      boxShadow: {
        "glow-accent": "0 0 40px -8px rgba(99,102,241,0.4)",
        "glow-cyan": "0 0 40px -8px rgba(34,211,238,0.3)",
        "card-border": "inset 0 0 0 1px rgba(255,255,255,0.06)",
        "inner-highlight": "inset 0 1px 0 rgba(255,255,255,0.07)",
      },
      animation: {
        "scan-vertical": "scanVertical 4s linear infinite",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "border-flow": "borderFlow 3s linear infinite",
        "fade-up": "fadeUp 0.6s ease-out forwards",
        flicker: "flicker 8s linear infinite",
      },
      keyframes: {
        scanVertical: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        borderFlow: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "92%": { opacity: "1" },
          "93%": { opacity: "0.6" },
          "94%": { opacity: "1" },
          "96%": { opacity: "0.8" },
          "97%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
