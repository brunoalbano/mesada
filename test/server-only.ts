// `server-only` existe para o bundler recusar o import a partir de um
// componente de cliente. Sob o vitest não há bundler, e o pacote lança sempre.
// Este stub o substitui nos testes, sem afetar o build.
export {}
