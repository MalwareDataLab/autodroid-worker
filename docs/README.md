<p align="center">
  <a href="" rel="noopener">
    <img width="200px" height="200px" src="./assets/logo.png" alt="Project logo" style="fill:#000000">
  </a>
</p>

<h3 align="center">AutoDroid Worker</h3>

<div align="center">

[![Status](https://img.shields.io/badge/status-active-success.svg)]()

</div>

---

## 📝 Índice <a name="summary"></a>

- [📖 Sobre](#about)
- [✨ Visão Geral do Projeto](#overview)
- [🏦 Arquitetura](#architecture)
- [⛏️ Tecnologias Utilizadas](#built_using)
- [💻 Ambiente do Usuário](#user_environment)
- [📡 Ambiente do Servidor](#server_environment)
- [🏁 Primeiros Passos](#getting_started)
- [🚀 Deployment](#deployment)
- [🔃 Atualizando](#updating)
- [🔧 Solução de Problemas](#troubleshooting)
- [🤝🏻 Contribuições](./CONTRIBUTING.md)
- [💾 Changelog](./CHANGELOG.md)
- [📖 Referências](#bibliography)

## 📖 Sobre <a name = "about"></a>

Este repositório contém o código do Worker da aplicação AutoDroid, que é responsável por processar os jobs em background.

Acesse o repositório da aplicação [AutoDroid API](https://github.com/MalwareDataLab/autodroid-api) para maiores informações sobre o projeto e as configurações necessárias antes deste Worker ser executado.

### Motivação

Este projeto parte da necessidade de oferecer a ferramenta DroidAugmentor e MalSynGen como um serviço, conforme apresentado em [AutoDroid](https://sol.sbc.org.br/index.php/sbseg_estendido/article/view/27273).

A [Prova de Conceito](https://sol.sbc.org.br/index.php/errc/article/view/26020) foi desenvolvida para validar a proposta de oferecer a DroidAugmentor e MalSynGen como um serviço, que utilizou a tecnologia Docker-in-Docker para a execução da ferramenta.

### Desafios

Todavia, diante da necessidade de escalabilidade e facilidade de uso, foi necessário remover a estratégia DinD e adotar uma abordagem que proporcionasse computação distribuída sem obstruir o tráfego da [aplicação principal (AutoDroid API)](https://github.com/MalwareDataLab/autodroid-api).

Disponibilizar tal laboratório como um serviço em nível nacional pode ser muito desafiador, pois a execução de aplicações como a DroidAugmentor e MalSynGen podem utilizar grandes recursos computacionais e de armazenamento, além de poder levar muitos dias ou semanas para um processamento ser concluído.

### Solução

Inspirado na ideia do [Github Actions](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners) onde os usuários podem dedicar máquinas para executar pipelines despachadas pelo GitHub, foi desenvolvido o Worker, que é uma aplicação separada da API, responsável por processar os jobs em background.

Essa aplicação foi desenvolvida especialmente buscando não expor a infraestrutura do servidor principal, mas se comunicando com a API Gateway através de Websocket/REST, permitindo a instância de múltiplos workers, em máquinas distintas, sem dependência de VPN's ou concessões de acesso, tornando o processo distribuído e seguro.

## ✨ Visão Geral do Projeto <a name="overview"></a>

O Worker está inserido no contexto do projeto AutoDroid, que é uma aplicação que visa oferecer a ferramenta DroidAugmentor/MalSynGen como um serviço.

<img src="./assets/system-context.jpg" alt="Overview" style="fill:#000000">

## ⛏️ Tecnologias Utilizadas <a name = "built_using"></a>

- [TypeScript](https://www.typescriptlang.org/) - Linguagem de programação
- [Node.js](https://nodejs.org/) - Ambiente de execução
- [Docker](https://www.docker.com/) - conteinerização
- [Dockerode](https://github.com/apocas/dockerode) - API Docker
- [Vitest](https://vitest.dev/) - Framework de testes
- [Yarn](https://yarnpkg.com/) - Gerenciador de pacotes

### Geral

É importante mencionar as demais ferramentas que serão utilizadas nas duas partes do projeto:

- [Git](https://git-scm.com/) - Controle de versão
- [Husky](https://typicode.github.io/husky/#/) - Hooks do Git
- [Lint Staged](https://github.com/okonet/lint-staged) - Ferramenta para verificar arquivos commitados
- [Commitizen](https://github.com/commitizen/cz-cli) - Auxiliar para mensagens de commit do Git
- [Commitlint](https://commitlint.js.org/) - Verificador de mensagens de commit do Git
- [Standard Version](https://github.com/conventional-changelog/standard-version) - Gerador de changelog
- [Eslint](https://eslint.org/) - Framework de verificação de código
- [Prettier](https://prettier.io/) - Formatador de código
- [Semver](https://semver.org/) - Versionamento semântico

## 🚩 Antes de começar <a name = "before_start"></a>

Crie a instância do (AutoDroid API Gateway) conforme especificado no repositório principal [AutoDroid API](https://github.com/MalwareDataLab/autodroid-api).

Utilizando um usuário autenticado como administrador, crie um `WorkerRegistrationToken` na API Gateway, que será utilizado para autenticar o Worker com a API. Utilize o Postman, SDK ou linha de comando para executar esta ação.

Exemplo:
```bash
curl --location 'http://localhost:3333/admin/worker/registration-token' \
--header 'Content-Type: application/json' \
--header 'Authorization: < TOKEN >' \
--data '{
    "is_unlimited_usage": true
}'
```

Obtenha o token através do valor `token` retornado pela API.


## 🏁 Primeiros Passos <a name = "getting_started"></a>

Estas instruções irão ajudá-lo a obter uma cópia deste projeto e executá-lo em sua máquina local para fins de desenvolvimento e teste. Consulte [deployment](#deployment) para obter informações sobre como implantar o projeto em ambiente produtivo.

Execute todos os passos de [antes de começar](#before_start). Salve todos certificados e chaves de acesso em um local seguro.

Existem duas maneiras de instalar esta aplicação: [utilizando o Docker (recomendado)](#docker_setup) ou [manualmente](#manual_setup).

### Instância via Docker (recomendado) <a name="docker_setup"></a>

Usando o terminal, clone este repositório em sua máquina local usando o Git:

```bash
git clone https://github.com/MalwareDataLab/autodroid-worker
```

Navegue até a pasta do repositório:

```bash
cd autodroid-worker
```

Atualize o repositório sempre, utilizando:

```bash
git pull
```

Introduza a variável de ambiente `REGISTRATION_TOKEN` no arquivo `.docker-compose.dev.yml` na raiz do projeto, com o valor obtido em [antes de começar](#before_start).

```bash

Inicie o projeto:

```bash
docker compose -f docker-compose.dev.yml up
```

Para parar a aplicação, pressione ```Ctrl + C``` no terminal ou execute ```docker compose -f docker-compose.dev.yml down``` na raiz deste repositório, caso esteja executando a aplicação em modo destacado.

Uma pasta `./runtime` será criada na raiz deste repositório para armazenar os arquivos temporários da aplicação. Pode ser necessário permissões de superusuário para acessar, modificar ou excluir esta pasta.

Realize a utilização da aplicação conforme em [utilização](https://github.com/MalwareDataLab/autodroid-api#usage).

### Instância Manual <a name="manual_setup"></a>

Instale as dependências do projeto:

```bash
yarn install
```

## 🚀 Deployment <a name = "deployment"></a>

Esta aplicação está pronta para implantação com Docker e docker compose.

Para disponibilizar esta aplicação em ambiente produtivo:

Realize o download na pasta desejada:

```bash
git clone https://github.com/MalwareDataLab/autodroid-worker
```

Atualize o repositório utilizando:

```bash
git pull
```

Complete os mesmos processos citados anteriormente em [antes de começar](#before_start).

Após a configuração e especificação do token no arquivo `docker-compose.prod.yml`, inicie a aplicação utilizando o comando:

```bash
docker compose -f docker-compose.prod.yml up -d
```

A aplicação estará disponível até que seja parada através do comando:

```bash
docker compose -f docker-compose.prod.yml down
```

A aplicação utiliza protocolo HTTPS e WS para a comunicação.

Configure sua rede local e as portas do firewall para permitir o acesso à aplicação.

Verifique as restrições da sua rede local e ISP.

## 🔃 Atualizando <a name = "updating"></a>

O docker compose está instrumentado com a ferramenta [watchtower](https://containrrr.dev/watchtower/) para atualizações automáticas.

Para realizar atualização manual, execute o seguinte comando:

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## 🔧 Solução de Problemas <a name = "troubleshooting"></a>

O Docker é incrível, mas às vezes pode ser um pouco complicado. Alguns erros podem ocorrer durante a execução da aplicação, e alguns deles podem estar relacionados ao Docker.

### Erros antes da inicialização

Se você estiver enfrentando alguns erros antes da inicialização da aplicação, verifique os seguintes itens:

- Verifique se a máquina atende aos [requisitos](#server_environment).
- Verifique se todos os passos especificados em [antes de começar](#before_start) foram completados, refaça-os se necessário.
- Verifique se seu usário possui permissões de uso ao Docker, executando o comando `docker run --rm hello-world:latest`.
- Realize os processos de pós-instalação do Docker, conforme [documentação oficial](https://docs.docker.com/engine/install/linux-postinstall/).

### Limpando o ambiente do Docker

Se você estiver enfrentando alguns erros relacionados ao Docker, você pode tentar limpar o ambiente do Docker executando os seguintes comandos:

```bash
# Pare todos os containers
docker compose down
docker stop $(docker ps -q)

# Remova todos os arquivos da pasta runtime
sudo rm -rf ./.runtime

# Remova todas as imagens relacionadas a este projeto
docker rmi $(docker images -q -f "reference=autodroid_*")

# Reinicie o serviço de rede
sudo systemctl restart NetworkManager.service

# (Opcional) Limpe o ambiente do Docker
docker system prune -a
```

### Verificando as etapas de inicialização

Se você estiver enfrentando alguns erros durante a inicialização da aplicação, você pode verificar as etapas da inicialização executando os seguintes comandos:

```bash
# Tente usar qualquer imagem do Docker Hub que não esteja em sua máquina para verificar se o Docker instalado está funcionando como esperado
docker rmi hello-world
docker run --rm hello-world:latest

# Tente construir a aplicação manualmente, em caso de erro, envie a mensagem de erro para o mantenedor do projeto
docker compose build --no-cache
```

Persistindo o erro, entre em contato com o mantenedor do projeto.

## 📖 Referências <a name="bibliography"></a>

LAVIOLA, Luiz Felipe; PAIM, Kayuã Oleques; KREUTZ, Diego; MANSILHA, Rodrigo Brandão. AutoDroid: disponibilizando a ferramenta DroidAugmentor como serviço. In: ESCOLA REGIONAL DE REDES DE COMPUTADORES (ERRC), 20. , 2023, Porto Alegre/RS. Anais [...]. Porto Alegre: Sociedade Brasileira de Computação, 2023 . p. 145-150. DOI: https://doi.org/10.5753/errc.2023.929.
