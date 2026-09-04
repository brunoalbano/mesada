# Cofrinho — Escopo de Funcionalidades

**Status:** aprovado, revisado
**Versão:** 2.0
**Data:** 2026-09-04

Complementa `docs/architecture.md`. Este documento define o que entra no MVP, o que fica para depois e por quê.

---

## Regra de corte do MVP

Entra no MVP o que é necessário para uma família real trocar a planilha ou o caderno pelo aplicativo. Fica fora tudo que melhora a experiência mas não impede o uso diário.

Um critério auxiliar: se o recurso pode ser adicionado depois sem migração destrutiva do banco, ele é candidato natural a ficar fora do MVP.

---

## Parte 1 — MVP

### 1.1 Conta do responsável

- Entrar com Google ou com magic link por e-mail.
- Criar família e nomeá-la.
- Convidar outro responsável por link de convite com validade.
- Participar de mais de uma família com a mesma conta, e alternar entre elas.
- Sair de uma família.
- Uma família nunca enxerga dados de outra. A separação é garantida por Row Level Security no banco.

### 1.2 Crianças

- Cadastrar criança com apelido, avatar ilustrado e data de nascimento opcional.
- Editar e arquivar criança. Arquivar preserva todo o histórico; nada é apagado.
- Escolher o modo de interface (Pequeno ou Grande) ou deixar que a idade decida.

### 1.3 Lançamentos

- Adicionar mesada (crédito) com valor, motivo e ícone.
- Descontar (débito) com valor, motivo e ícone.
- Valores em centavos, teclado numérico, formatação em Real durante a digitação.
- Motivos sugeridos em atalhos de um toque, para o lançamento rotineiro não exigir digitação.
- **Estorno**: qualquer lançamento pode ser estornado, nunca editado nem apagado. O estorno gera uma linha nova e as duas ficam visíveis.

### 1.4 Saldo e histórico

- Saldo de cada criança, em um número só. Não existe saldo bloqueado nem valor reservado.
- Histórico em ordem cronológica inversa, com data, motivo, ícone, valor e **qual responsável lançou**. A autoria importa quando dois pais usam o mesmo aplicativo.
- Lançamento estornado aparece marcado.
- Filtro por período.

### 1.5 Meta de poupança

Uma meta por criança de cada vez, deliberadamente simples.

- O **responsável** cria a meta com título, ícone e valor-alvo. O alvo é o valor que o **saldo total** precisa alcançar. A criança acompanha, não cria nem cancela.
- No máximo uma meta ativa por criança, garantido por índice único no banco.
- Progresso calculado do saldo atual contra o alvo: quanto já tem e quanto falta.
- Sem reserva, sem alocação, sem saldo bloqueado. O dinheiro da meta é o próprio saldo, e a criança continua livre para gastar.
- Saldo alcança o alvo: o cofrinho transborda, com confete, a meta passa a "alcançada" e **o cálculo para**. Se o saldo cair depois, a meta continua alcançada e o progresso continua em 100%. Meta alcançada nunca reabre.
- Alcançar a meta não movimenta dinheiro. Comprar o objetivo é um débito comum no histórico.
- O responsável cancela a meta a qualquer momento. Depois de alcançada ou cancelada, cria outra.
- Metas antigas ficam no histórico da criança.

### 1.6 Acesso da criança

Duas formas, ambas no MVP, levando à mesma tela:

1. **Link próprio da criança.** É o **caminho principal**. Não exige conta, não exige e-mail, não exige senha, e funciona para criança de qualquer idade. O pai gera o link, manda para o dispositivo da criança, e a criança abre. Somente leitura por padrão.
2. **Conta Google ou magic link.** Opcional, para quem tem 13 anos ou mais e prefere entrar com a própria conta. Nunca é exigida.

Ambas resolvem para o mesmo perfil de criança e mostram exatamente os mesmos dados. Uma criança pode ter as duas ao mesmo tempo, ou só o link.

O pai administra os links: cria com rótulo ("tablet da sala"), define validade com padrão de 365 dias, vê quando cada um foi usado pela última vez, revoga e gera outro.

A criança vê: saldo, histórico e metas. A criança nunca cria nem altera lançamento no MVP.

### 1.7 Idioma

- Interface em **português, inglês e espanhol**.
- Idioma detectado pelo `Accept-Language` do navegador na primeira visita, resolvido no servidor.
- Troca manual a qualquer momento, gravada em cookie e no perfil do responsável.
- Idioma da criança herda o da família; o responsável pode fixar um por criança.
- Datas, números e plurais formatados por `Intl` no idioma resolvido.
- **A moeda não muda com o idioma.** Continua sendo a da família, sempre BRL no MVP.
- O nome "Cofrinho" não é traduzido.

### 1.8 Interface lúdica

- Mobile first, uma mão, alvos de toque grandes.
- Modo Pequeno e Modo Grande. No MVP o Modo Grande é variação de tipografia, vocabulário e densidade sobre o mesmo layout, não uma segunda interface.
- Cofrinho ilustrado, avatares, ícones e textos lúdicos nos placeholders e estados vazios.
- Animação de moeda no crédito e o cofrinho transbordando na meta atingida, com respeito a `prefers-reduced-motion`.
- Contraste AA, texto a partir de 16 px, entrada e saída distinguidas por sinal, ícone e palavra, além da cor.

### 1.9 PWA

- Instalável em Android e iOS, com ícone próprio e tela de abertura.
- Onboarding que ensina a adicionar à tela de início.
- Leitura offline do último saldo, histórico e metas conhecidos, com carimbo de atualização.

### 1.10 Fora do MVP, mas obrigatório junto com ele

Itens sem os quais o MVP não pode ir ao ar:

- Migrations SQL versionadas, com índices, RLS ligada nas nove tabelas, triggers de estorno e de meta, e o Custom Access Token Hook.
- Backup semanal por GitHub Action, com restauração testada antes do lançamento. O plano gratuito do Supabase não tem backup nem PITR.
- Faxina agendada de usuários anônimos órfãos, no mesmo workflow que evita a pausa do projeto.
- Página de privacidade, exclusão de conta e transferência de `owner` ao sair da família.
- Traduções completas em `pt`, `en` e `es`, com build falhando em chave faltante.
- Testes de fluxo crítico: lançamento, estorno, meta alcançada, reabertura por estorno, isolamento entre famílias, acesso por link expirado, e sessão viva de link revogado.
- GitHub Action que evita a pausa do projeto Supabase por inatividade.
- Página de privacidade explicando o tratamento mínimo de dados de menores.
- Ícones do PWA, ilustrações do cofrinho nos quatro estados e oito avatares. São cerca de 14 ilustrações no caminho crítico.

---

## Parte 2 — Pós-MVP

Em ordem sugerida de implementação. A ordem privilegia o que reduz trabalho manual do pai, que é o motivo mais comum de abandono deste tipo de aplicativo.

### 2.1 Mesada recorrente automática

Valor, periodicidade (semanal, quinzenal, mensal) e dia. O sistema credita sozinho e registra que o lançamento foi automático. Implementação com Vercel Cron ou `pg_cron`. **É o recurso de maior impacto fora do MVP**, porque elimina a tarefa repetitiva que faz o pai parar de usar o aplicativo.

### 2.2 Pedido de gasto e proposta de meta

A criança pede uma baixa ("quero comprar figurinha, R$ 12") e propõe metas ("quero juntar pra bicicleta, R$ 400"). O pai aprova ou recusa no aplicativo; a aprovação gera a transação ou a meta. Tira o pai do papel de digitador e dá iniciativa à criança. Requer que o token de link possa ter escopo de escrita limitada, já previsto em `access_tokens.can_request`, o que enfraquece a garantia de somente leitura do link — por isso ficou fora do MVP.

### 2.3 Tarefas com valor

Lista de tarefas, cada uma com valor e periodicidade. O pai marca como feita e o crédito é lançado automaticamente. Aproxima o produto de mesada condicional a responsabilidade.

### 2.4 Notificações push

"Sua mesada caiu", "meta alcançada", "novo pedido esperando". Depende da instalação do PWA em iOS.

### 2.5 Várias metas ao mesmo tempo, com reserva

Mais de uma meta ativa por criança exige separar o dinheiro por meta, senão o mesmo saldo aparece como progresso de duas metas ao mesmo tempo e mente para a criança. Introduz reserva de valor e o conceito de saldo livre. Só vale a pena se o uso mostrar que uma meta por vez limita as famílias.

### 2.6 Cofrinho com rendimento

Saldo de poupança separado, que rende um percentual definido pelo pai. Ensina juros compostos de forma concreta. Depende da reserva de valor do item anterior.

### 2.7 Exportar histórico

CSV e um resumo mensal em PDF por criança.

### 2.8 Relatórios e gráficos

Quanto entrou e saiu por mês, categorias de gasto, evolução do saldo. Modo Grande apenas.

### 2.9 Categorias de gasto

Categoria em cada lançamento, com ícone. Alimenta os relatórios.

### 2.10 Gamificação

Sequências de poupança, conquistas, medalhas por meta concluída. Alto risco de virar enfeite; só depois que o uso diário estiver estável.

### 2.11 Multi-moeda

Coluna de moeda por família. Já previsto no modelo de dados para não exigir migração destrutiva.

### 2.12 Fila offline de escrita

Lançar sem rede e sincronizar depois. Exige resolução de conflito e identificador idempotente por lançamento.

### 2.13 Foto de recibo

Anexo de imagem no lançamento, com Supabase Storage. Cuidado adicional de privacidade e consumo do plano gratuito.

### 2.14 Transferência entre irmãos

Uma criança empresta ou dá para a outra, com aprovação do pai.

---

## Parte 3 — Explicitamente fora de escopo

Não entram nem no MVP nem no roteiro atual:

- Integração com banco, Pix ou cartão real. Muda a natureza regulatória do produto.
- Upload de foto da criança. Dado sensível de menor sem benefício proporcional.
- Rede social, comparação entre famílias, ranking público.
- Aplicativo nativo em loja. O PWA atende, e a loja exige custo anual e revisão.

---

## Parte 4 — Ordem de construção do MVP

0. Migrations: schema, índices, RLS nas nove tabelas, helpers `security definer`, triggers de estorno e de meta, Custom Access Token Hook. Variáveis de ambiente e fluxo de migration no CI.
1. Autenticação do responsável. Criar família por função `security definer`.
2. Convite de responsável: emissão, uso único atômico, revogação, saída de família com transferência de `owner`.
3. Cadastro de criança, edição, arquivamento.
4. Lançamento, estorno, saldo e histórico com autoria e filtro por período.
5. Meta de poupança, com o trigger que a marca como alcançada e o estorno que a reabre.
6. Link da criança: geração com rótulo e validade, troca por sessão, revogação que mata a sessão viva, limite de taxa em Postgres, tela da criança.
7. Conta Google da criança, opcional, por convite emitido pelo pai.
8. Idioma: `next-intl`, três arquivos de mensagem, resolução por `Accept-Language`, manifesto dinâmico.
9. Camada lúdica: cofrinho ilustrado nos quatro estados, oito avatares, modos, animação.
10. PWA: manifesto, service worker com `/c/*` na denylist, leitura offline, onboarding de instalação.
11. Backup, faxina agendada, keep-alive com commit, estado degradado de banco pausado, página de privacidade.
12. Testes de fluxo crítico e publicação.

Cada etapa é entregável e testável isoladamente. As etapas 0 a 6 já formam um produto usável por uma família.
