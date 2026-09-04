# Mesada — Escopo de Funcionalidades

**Status:** proposta para revisão
**Versão:** 0.1
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

- Saldo total, valor reservado em metas e saldo livre, para cada criança.
- Histórico em ordem cronológica inversa, com data, motivo, ícone, valor e **qual responsável lançou**. A autoria importa quando dois pais usam o mesmo aplicativo.
- Lançamento estornado aparece marcado.
- Filtro por período.

### 1.5 Metas de poupança

- Criar meta com título, ícone e valor-alvo. Prazo opcional.
- Reservar dinheiro do saldo livre para a meta, e devolver a reserva.
- Progresso visível: quanto já tem, quanto falta.
- Meta atinge o alvo: comemoração com o mascote e confete, e a meta passa a "alcançada".
- Concluir a meta: libera a reserva e registra a saída correspondente, em um fluxo único.
- Cancelar a meta devolve tudo ao saldo livre.
- Mais de uma meta ativa por criança. Por isso o modelo é de reserva, e não de barra de progresso sobre o saldo total (ver `docs/architecture.md`, seção 3.3).

### 1.6 Acesso da criança

Duas formas, ambas no MVP, levando à mesma tela:

1. **Link próprio da criança.** É o **caminho principal**. Não exige conta, não exige e-mail, não exige senha, e funciona para criança de qualquer idade. O pai gera o link, manda para o dispositivo da criança, e a criança abre. Somente leitura por padrão.
2. **Conta Google ou magic link.** Opcional, para quem tem 13 anos ou mais e prefere entrar com a própria conta. Nunca é exigida.

Ambas resolvem para o mesmo perfil de criança e mostram exatamente os mesmos dados. Uma criança pode ter as duas ao mesmo tempo, ou só o link.

O pai administra os links: cria com rótulo ("tablet da sala"), vê quando cada um foi usado pela última vez, revoga e gera outro.

A criança vê: saldo, histórico e metas. A criança nunca cria nem altera lançamento no MVP.

### 1.7 Interface lúdica

- Mobile first, uma mão, alvos de toque grandes.
- Modo Pequeno e Modo Grande, conforme `docs/architecture.md`, seção 6.
- Mascote, avatares ilustrados, ícones e textos lúdicos nos placeholders e estados vazios.
- Animação de moeda no crédito e confete na meta atingida, com respeito a `prefers-reduced-motion`.
- Contraste AA, texto a partir de 16 px, entrada e saída distinguidas por sinal, ícone e palavra, além da cor.

### 1.8 PWA

- Instalável em Android e iOS, com ícone próprio e tela de abertura.
- Onboarding que ensina a adicionar à tela de início.
- Leitura offline do último saldo, histórico e metas conhecidos, com carimbo de atualização.

### 1.9 Fora do MVP, mas obrigatório junto com ele

Itens sem os quais o MVP não pode ir ao ar:

- Migrations SQL versionadas, com as policies RLS incluídas.
- Testes de fluxo crítico: lançamento, estorno, reserva de meta, isolamento entre famílias, acesso por link expirado e revogado.
- GitHub Action que evita a pausa do projeto Supabase por inatividade.
- Página de privacidade explicando o tratamento mínimo de dados de menores.

---

## Parte 2 — Pós-MVP

Em ordem sugerida de implementação. A ordem privilegia o que reduz trabalho manual do pai, que é o motivo mais comum de abandono deste tipo de aplicativo.

### 2.1 Mesada recorrente automática

Valor, periodicidade (semanal, quinzenal, mensal) e dia. O sistema credita sozinho e registra que o lançamento foi automático. Implementação com Vercel Cron ou `pg_cron`. **É o recurso de maior impacto fora do MVP**, porque elimina a tarefa repetitiva que faz o pai parar de usar o aplicativo.

### 2.2 Pedido de gasto

A criança pede uma baixa ("quero comprar figurinha, R$ 12"). O pai aprova ou recusa no aplicativo. A aprovação gera a transação. Tira o pai do papel de digitador e dá iniciativa à criança. Requer que o token de link possa ter escopo de escrita limitada, já previsto em `access_tokens.can_request`.

### 2.3 Tarefas com valor

Lista de tarefas, cada uma com valor e periodicidade. O pai marca como feita e o crédito é lançado automaticamente. Aproxima o produto de mesada condicional a responsabilidade.

### 2.4 Notificações push

"Sua mesada caiu", "meta alcançada", "novo pedido esperando". Depende da instalação do PWA em iOS.

### 2.5 Cofrinho com rendimento

Saldo de poupança separado, que rende um percentual definido pelo pai. Ensina juros compostos de forma concreta. Reaproveita `goal_movements` e o extrato de rendimento vira transação com origem automática.

### 2.6 Exportar histórico

CSV e um resumo mensal em PDF por criança.

### 2.7 Relatórios e gráficos

Quanto entrou e saiu por mês, categorias de gasto, evolução do saldo. Modo Grande apenas.

### 2.8 Categorias de gasto

Categoria em cada lançamento, com ícone. Alimenta os relatórios.

### 2.9 Gamificação

Sequências de poupança, conquistas, medalhas por meta concluída. Alto risco de virar enfeite; só depois que o uso diário estiver estável.

### 2.10 Multi-moeda

Coluna de moeda por família. Já previsto no modelo de dados para não exigir migração destrutiva.

### 2.11 Fila offline de escrita

Lançar sem rede e sincronizar depois. Exige resolução de conflito e identificador idempotente por lançamento.

### 2.12 Foto de recibo

Anexo de imagem no lançamento, com Supabase Storage. Cuidado adicional de privacidade e consumo do plano gratuito.

### 2.13 Transferência entre irmãos

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

1. Migrations, RLS e sementes de dados.
2. Autenticação do responsável, família e convite de responsável.
3. Cadastro de criança.
4. Lançamento, estorno, saldo e histórico.
5. Metas de poupança.
6. Link da criança e a tela da criança.
7. Conta Google da criança, opcional.
8. Camada lúdica: mascote, modos, animação, avatares.
9. PWA, offline de leitura e onboarding de instalação.
10. Testes de fluxo crítico e publicação.

Cada etapa é entregável e testável isoladamente. As etapas 1 a 6 já formam um produto usável por uma família.
