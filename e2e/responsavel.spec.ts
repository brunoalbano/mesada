import { expect, test } from '@playwright/test'
import { abrirSessao } from './sessao'

/**
 * Fluxo completo do responsável, com sessão de verdade contra o banco de
 * desenvolvimento.
 *
 * Pulado quando as contas de teste não estão configuradas: quem clonou o
 * repositório agora deve conseguir rodar a suíte sem pedir segredo a ninguém.
 * Crie as contas no painel, em Authentication > Users > Add user, com
 * "Auto Confirm User" marcado, e exporte:
 *
 *   E2E_EMAIL, E2E_SENHA
 *
 * Não roda em ambiente com proxy de saída obrigatório: o servidor Next valida
 * a sessão chamando o Supabase pelo `fetch` do Node, que ignora HTTP_PROXY e
 * HTTPS_PROXY. Sem alcançar o Auth, o servidor trata a requisição como
 * anônima e manda para a entrada — sem erro visível, o que torna o sintoma
 * difícil de ler. O helper de sessão tem uma saída por curl para o próprio
 * login, mas o servidor não tem.
 */
const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const CHAVE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

test.skip(
  !EMAIL || !SENHA || !URL_SUPABASE || !CHAVE,
  'defina E2E_EMAIL, E2E_SENHA e as variáveis do Supabase para rodar este fluxo',
)

// O dispositivo padrão do Playwright manda Accept-Language en-US, e a interface
// obedece. Fixar o idioma aqui deixa o teste falar do produto, e não do
// emulador; o idioma em si é testado em publico.spec.ts.
test.use({ locale: 'pt-BR', extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' } })

test('do login ao lançamento, passando por família, criança e estorno', async ({ page, context }) => {
  await abrirSessao(context, {
    url: URL_SUPABASE!,
    chave: CHAVE!,
    email: EMAIL!,
    senha: SENHA!,
  })

  await page.goto('/')

  const sufixo = Date.now().toString().slice(-6)
  const familia = `Teste ${sufixo}`

  await page.getByLabel(/nome da família/i).fill(familia)
  await page.getByRole('button', { name: /^criar família$/i }).click()
  await expect(page.getByRole('link', { name: new RegExp(familia) })).toBeVisible()

  await page.getByRole('link', { name: new RegExp(familia) }).click()

  await page.getByLabel(/apelido/i).fill('Ana')
  await page.getByRole('button', { name: /adicionar criança/i }).click()
  await expect(page.getByRole('link', { name: /Ana/ })).toBeVisible()

  await page.getByRole('link', { name: /Ana/ }).click()

  // Vírgula como separador decimal: é o hábito em dois dos três idiomas, e o
  // motivo de o campo ser texto em vez de type=number.
  await page.getByLabel(/quanto/i).fill('20,50')
  await page.getByLabel(/por quê/i).fill('Mesada da semana')
  await page.getByRole('button', { name: /dar mesada/i }).click()

  await expect(page.getByText('Mesada da semana')).toBeVisible()
  await expect(page.getByText(/R\$\s*20,50/)).toBeVisible()

  // Estorno: o valor volta a zero e o lançamento aparece riscado, nunca some.
  await page.getByTitle(/estornar/i).first().click()
  await expect(page.getByText(/R\$\s*0,00/)).toBeVisible()
  await expect(page.getByText('Mesada da semana')).toBeVisible()
})
