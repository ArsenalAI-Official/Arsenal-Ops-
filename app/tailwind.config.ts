/** @type {import('tailwindcss').Config} */
import typography from "@tailwindcss/typography";
import animate from "tailwindcss-animate";

export default {
    darkMode: ["class"],
    content: [
        './index.html',
        './src/**/*.{ts,tsx,js,jsx}',
    ],
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                // Style Guide 1a semantic palette. Brand gold is for the logo +
                // one primary CTA per screen only; status is a cool workflow
                // ramp; priority a warm severity ramp; surface/line are warm
                // neutrals. Hexes mirror the tokens in src/index.css.
                brand: { DEFAULT: "#E0B954", fg: "#080808" },
                info: "#5B9BE6",
                surface: { DEFAULT: "#151312", raised: "#1E1B18" },
                line: "#2A2724",
                // Warm-neutral text ramp (mirrors --text-* in index.css). Note
                // text-hi == foreground and text-mid == muted-foreground, so
                // prefer those shadcn utilities; `ink` covers the rest + intent.
                ink: { hi: "#F5F3EF", mid: "#A6A29C", low: "#6E6A64" },
                // Default (non-status) progress-bar fill.
                progress: "#8A8A8A",
                status: {
                    backlog: "#64748B",
                    todo: "#3B82F6",
                    "in-progress": "#6E62E6",
                    "in-review": "#D06BB0",
                    done: "#40BE86",
                    blocked: "#E5484D",
                },
                priority: {
                    low: "#64748B",
                    medium: "#94A3B8",
                    high: "#EC7A3C",
                    critical: "#E5484D",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
            },
        },
    },
    plugins: [animate, typography],
}
