import type { Config } from 'tailwindcss'

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ver docs/architecture.md 6.2. Entrada e saída nunca se distinguem
        // só pela cor: sempre com sinal, ícone e palavra.
        marca: { DEFAULT: '#4f46e5', escuro: '#3730a3', claro: '#eef2ff' },
        moeda: '#f59e0b',
        entrada: '#15803d',
        saida: '#be123c',
      },
      fontFamily: {
        titulo: ['var(--fonte-titulo)', 'system-ui', 'sans-serif'],
        corpo: ['var(--fonte-corpo)', 'system-ui', 'sans-serif'],
      },
    },
  },
} satisfies Config
