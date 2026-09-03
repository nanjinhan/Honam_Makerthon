/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'], // 사용하지 않지만 shadcn 호환 위해 유지 (SPEC §4-2)
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        // SPEC §4-3 — 평상시엔 파랑 하나. 주의/위험일 때만 색이 나타난다.
        ok: '#2F6BEA',
        warn: '#E8A23C',
        alert: '#DC4C4C',
        track: '#E9EEF5',

        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', 'system-ui', 'sans-serif'],
      },
      // SPEC §4-5 — 카드 20px, 중첩 14px, 버튼 12px
      borderRadius: {
        card: '20px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        nest: '14px',
        btn: '12px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,30,50,.04), 0 8px 24px -12px rgba(20,30,50,.10)',
        float: '0 2px 8px rgba(20,30,50,.06), 0 20px 40px -20px rgba(20,30,50,.16)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
