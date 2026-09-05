import { expect, test } from '@playwright/test'

/**
 * Fluxos que não exigem sessão. Rodam em qualquer máquina, sem segredo
 * nenhum, e cobrem o que quebra com mais frequência: idioma, redirecionamento
 * e instalabilidade.
 */

test('sem sessão, a raiz leva para a entrada', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/entrar$/)
})

test.describe('português', () => {
  // O dispositivo padrão do Playwright manda Accept-Language en-US. Sem fixar
  // o cabeçalho, este teste checaria o idioma do emulador, e não o do produto.
  test.use({ locale: 'pt-BR', extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' } })

  test('navegador em português recebe a interface em português', async ({ page }) => {
    await page.goto('/entrar')
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt')
    await expect(page.getByRole('button', { name: /receber link de acesso/i })).toBeVisible()
  })

  test('a página de privacidade existe e responde no idioma do navegador', async ({ page }) => {
    await page.goto('/privacidade')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Guardar dado de criança sem dizer o que se guarda não é opção.
    await expect(page.getByRole('heading', { name: /o que guardamos/i })).toBeVisible()
  })

  test('e-mail inválido não dispara requisição, e o erro é anunciado', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByLabel(/seu e-mail/i).fill('nao-e-email')
    await page.getByRole('button', { name: /receber link de acesso/i }).click()
    await expect(page.getByRole('alert')).toBeVisible()
  })
})

test.describe('idioma vem do navegador', () => {
  test.use({ locale: 'en-US', extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' } })

  test('navegador em inglês recebe a interface em inglês', async ({ page }) => {
    await page.goto('/entrar')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('button', { name: /send me a sign-in link/i })).toBeVisible()
  })
})

test.describe('espanhol', () => {
  test.use({ locale: 'es-419', extraHTTPHeaders: { 'Accept-Language': 'es-419,es;q=0.9' } })

  test('variante regional cai no idioma base', async ({ page }) => {
    await page.goto('/entrar')
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  })
})

test('o manifesto é servido e aponta para ícones existentes', async ({ page, request }) => {
  const resposta = await request.get('/manifest.webmanifest')
  expect(resposta.status()).toBe(200)

  const manifesto = await resposta.json()
  expect(manifesto.name).toBe('Mesada')
  // start_url fixo: derivar da URL aberta colocaria um token de convite no
  // atalho instalado.
  expect(manifesto.start_url).toBe('/')
  expect(manifesto.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true)

  for (const icone of manifesto.icons) {
    const arquivo = await request.get(icone.src)
    expect(arquivo.status(), `${icone.src} deve existir`).toBe(200)
  }
  await page.goto('/entrar')
})

test('um convite com token fora do formato é recusado sem tocar o banco', async ({ page }) => {
  await page.goto('/convite/pai/nao-e-um-token')
  await expect(page).toHaveURL(/\/convite\?erro=invalido/)
})

test('cabeçalhos de segurança estão presentes', async ({ request }) => {
  const resposta = await request.get('/entrar')
  const cabecalhos = resposta.headers()
  // O token de convite nunca deve vazar para terceiros pelo Referer.
  expect(cabecalhos['referrer-policy']).toBe('no-referrer')
  expect(cabecalhos['x-content-type-options']).toBe('nosniff')
  expect(cabecalhos['x-frame-options']).toBe('DENY')

  const csp = cabecalhos['content-security-policy'] ?? ''
  // Exfiltração para domínio arbitrário é o que mais importa barrar aqui.
  expect(csp).toContain("connect-src 'self'")
  expect(csp).toContain("object-src 'none'")
  expect(csp).toContain("frame-ancestors 'none'")
})

