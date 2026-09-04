import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BrowserContext } from '@playwright/test'

const executar = promisify(execFile)

/**
 * O `fetch` do Node ignora HTTP_PROXY e HTTPS_PROXY. Em ambiente com proxy de
 * saída obrigatório isso vira 403 sem explicação óbvia, então caímos para o
 * curl, que respeita as variáveis.
 */
async function pedir(url: string, cabecalhos: Record<string, string>, corpo: string) {
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    const argumentos = ['-s', '-w', '\n%{http_code}', '--max-time', '20', '-X', 'POST']
    for (const [nome, valor] of Object.entries(cabecalhos)) argumentos.push('-H', `${nome}: ${valor}`)
    argumentos.push('-d', corpo, url)

    const { stdout } = await executar('curl', argumentos)
    const quebra = stdout.lastIndexOf('\n')
    return { status: Number(stdout.slice(quebra + 1)), texto: stdout.slice(0, quebra) }
  }

  const resposta = await fetch(url, { method: 'POST', headers: cabecalhos, body: corpo })
  return { status: resposta.status, texto: await resposta.text() }
}

/**
 * Abre sessão sem passar pela caixa de entrada.
 *
 * A aplicação só oferece magic link e Google, e nenhum dos dois é automatizável
 * num teste. Então o teste autentica pela API e grava o cookie que o
 * `@supabase/ssr` espera encontrar.
 *
 * O formato do cookie é detalhe interno da biblioteca. Se ela mudar, este
 * helper quebra de forma visível, num teste, e não em produção — que é onde
 * esse acoplamento deve doer.
 */
export async function abrirSessao(
  contexto: BrowserContext,
  { url, chave, email, senha }: { url: string; chave: string; email: string; senha: string },
) {
  const resposta = await pedir(
    `${url}/auth/v1/token?grant_type=password`,
    { apikey: chave, 'Content-Type': 'application/json' },
    JSON.stringify({ email, password: senha }),
  )

  if (resposta.status !== 200) {
    throw new Error(`login falhou (${resposta.status}): ${resposta.texto.slice(0, 200)}`)
  }

  const sessao = JSON.parse(resposta.texto)
  const referencia = new URL(url).hostname.split('.')[0]
  const nome = `sb-${referencia}-auth-token`
  const valor = `base64-${Buffer.from(JSON.stringify(sessao)).toString('base64url')}`

  // A sessão passa de 4 KB, e o navegador descarta cookie desse tamanho. O
  // `@supabase/ssr` fatia em `nome.0`, `nome.1`, e remonta na leitura; um
  // cookie único seria simplesmente ignorado, e a página cairia no login sem
  // erro nenhum — que foi exatamente o sintoma.
  const TAMANHO = 3180
  const pedacos =
    valor.length <= TAMANHO
      ? [{ nome, valor }]
      : Array.from({ length: Math.ceil(valor.length / TAMANHO) }, (_, indice) => ({
          nome: `${nome}.${indice}`,
          valor: valor.slice(indice * TAMANHO, (indice + 1) * TAMANHO),
        }))

  await contexto.addCookies(
    pedacos.map((pedaco) => ({
      name: pedaco.nome,
      value: pedaco.valor,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    })),
  )
}
