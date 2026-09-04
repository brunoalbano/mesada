import { expect, test } from '@playwright/test'

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
 */
const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA

test.skip(!EMAIL || !SENHA, 'defina E2E_EMAIL e E2E_SENHA para rodar este fluxo')

test('do login ao lançamento, passando por família, criança e meta', async ({ page }) => {
  // Entrar por senha, e não por magic link: o teste não tem caixa de entrada.
  await page.goto('/entrar')
  await page.evaluate(
    async ([email, senha]) => {
      const { createBrowserClient } = await import(
        /* webpackIgnore: true */ 'https://esm.sh/@supabase/ssr@0.5.2'
      )
      const cliente = createBrowserClient(
        (window as never as { __URL: string }).__URL,
        (window as never as { __CHAVE: string }).__CHAVE,
      )
      await cliente.auth.signInWithPassword({ email: email!, password: senha! })
    },
    [EMAIL, SENHA],
  )

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
