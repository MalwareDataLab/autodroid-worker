# Contribuindo

Antes de começar, leia o [AGENTS.md](../AGENTS.md), com as regras de código, de imports e de testes. Use Node.js 20 (a versão exata está em `.nvmrc`) e Yarn 1.

## Fluxo

1. Faça um fork do repositório e clone o seu fork.
2. Crie um branch a partir do `develop`, um por correção ou funcionalidade. O nome começa com o tipo: `bugfix`, `feature`, `hotfix`, `release` ou `other`.

   ```bash
   git checkout -b bugfix/mudar-algo
   ```

   Se der erro, busque o repositório antes:

   ```bash
   git remote update && git fetch
   ```

3. Mantenha o branch atualizado:

   ```bash
   git pull origin develop
   ```

   Pode ser preciso resolver conflitos.

4. Instale as dependências:

   ```bash
   yarn
   ```

5. Faça o commit. O husky roda `yarn lint` e o lint-staged antes de cada commit. O commitizen abre um assistente para a mensagem, no padrão Conventional Commits, e o commitlint valida o resultado. As regras estão em [Mensagens de commit](./COMMIT_MESSAGE_GUIDELINES.md).
6. Abra o pull request para o branch `develop`.

Ao participar, siga o [código de conduta](./CODE_OF_CONDUCT.md).

## Verificação local

| Comando | O que faz |
| --- | --- |
| `yarn lint` | ESLint e `tsc` |
| `yarn test` | Todas as camadas de teste, com cobertura de 100% |
| `yarn test:unit` | Só os testes unitários |
| `yarn test:integration` | Docker real, com a imagem `alpine:latest` baixada antes |
| `yarn test:e2e` | Pipeline completo em contêineres reais, com a imagem de teste construída antes |
| `yarn coverage:gaps` | Arquivos que ainda estão abaixo de 100% de cobertura |

As camadas de integração e e2e precisam do Docker rodando.

## Release

O workflow `deploy.yml` roda em pushes para `main`, `staging` e `qa`. O release-please abre o PR de release a partir das mensagens de commit.
