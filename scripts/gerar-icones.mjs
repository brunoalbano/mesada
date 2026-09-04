/**
 * Gera os ícones do PWA a partir de um SVG único.
 *
 * Rode depois de mudar o desenho do cofrinho:
 *   node scripts/gerar-icones.mjs
 *
 * Os PNG são versionados: o build da Vercel não roda este script, e um ícone
 * ausente quebra a instalação do aplicativo sem quebrar o build.
 *
 * `maskable` precisa de margem: em Android o sistema recorta o ícone em
 * formatos variados, e desenho encostado na borda é cortado. A zona segura é
 * o círculo central de 80% do lado.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const FUNDO = '#4f46e5'
const MOEDA = '#f59e0b'
const ESCURO = '#3730a3'

/** @param {number} escala 1 = ocupa a arte inteira; 0.8 = zona segura maskable */
const svg = (escala) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${FUNDO}"/>
  <g transform="translate(256 256) scale(${escala}) translate(-256 -256)">
    <ellipse cx="256" cy="300" rx="150" ry="120" fill="#ffffff"/>
    <circle cx="316" cy="270" r="16" fill="${ESCURO}"/>
    <path d="M106 270c-20 0-30 15-30 30s10 30 30 30z" fill="#e0e7ff"/>
    <rect x="216" y="180" width="80" height="20" rx="10" fill="${ESCURO}"/>
    <rect x="166" y="404" width="40" height="40" rx="10" fill="#e0e7ff"/>
    <rect x="306" y="404" width="40" height="40" rx="10" fill="#e0e7ff"/>
    <circle cx="200" cy="120" r="32" fill="${MOEDA}"/>
    <circle cx="270" cy="86"  r="26" fill="${MOEDA}"/>
    <circle cx="330" cy="126" r="20" fill="${MOEDA}"/>
  </g>
</svg>`

const saidas = [
  { arquivo: 'icone-192.png', tamanho: 192, escala: 1 },
  { arquivo: 'icone-512.png', tamanho: 512, escala: 1 },
  { arquivo: 'icone-maskable-192.png', tamanho: 192, escala: 0.8 },
  { arquivo: 'icone-maskable-512.png', tamanho: 512, escala: 0.8 },
  { arquivo: 'apple-touch-icon.png', tamanho: 180, escala: 0.9 },
  { arquivo: 'favicon-32.png', tamanho: 32, escala: 1 },
]

await mkdir('public', { recursive: true })
await writeFile('public/icone.svg', svg(1))

for (const { arquivo, tamanho, escala } of saidas) {
  await sharp(Buffer.from(svg(escala))).resize(tamanho, tamanho).png().toFile(`public/${arquivo}`)
  console.log(`public/${arquivo}`)
}
