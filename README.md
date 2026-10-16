<p align="center">
  <img width="200px" height="200px" src="./docs/assets/logo.png" alt="Logo da AutoDroid" style="fill:#000000">
</p>

<h3 align="center">AutoDroid Worker</h3>

<div align="center">

![Status](https://img.shields.io/badge/status-active-success.svg)

</div>

---

## Sumário <a name="summary"></a>

- [Sobre](#about)
- [Visão geral do projeto](#overview)
- [Tecnologias utilizadas](#built_using)
- [Ambiente do servidor](#server_environment)
- [Antes de começar](#before_start)
- [Primeiros passos](#getting_started)
- [Implantação](#deployment)
- [Atualização](#updating)
- [Solução de problemas](#troubleshooting)
- [Telemetria](#telemetry)
- [Contribuições](./docs/CONTRIBUTING.md)
- [Changelog](./CHANGELOG.md)

## Sobre <a name="about"></a>

Este repositório contém o código do Worker da aplicação AutoDroid, que é responsável por processar os jobs em background.

Acesse o repositório da aplicação [AutoDroid API](https://github.com/MalwareDataLab/AutoDroid) para maiores informações sobre o projeto e as configurações necessárias antes deste Worker ser executado.

### Motivação

Este projeto parte da necessidade de oferecer a ferramenta DroidAugmentor e MalSynGen como um serviço, conforme apresentado em [AutoDroid](https://sol.sbc.org.br/index.php/sbseg_estendido/article/view/27273).

A [Prova de Conceito](https://sol.sbc.org.br/index.php/errc/article/view/26020) foi desenvolvida para validar a proposta de oferecer a DroidAugmentor e MalSynGen como um serviço, que utilizou a tecnologia Docker-in-Docker para a execução da ferramenta.

### Desafios

Todavia, diante da necessidade de escalabilidade e facilidade de uso, foi necessário remover a estratégia DinD e adotar uma abordagem que proporcionasse computação distribuída sem obstruir o tráfego da [aplicação principal (AutoDroid API)](https://github.com/MalwareDataLab/AutoDroid).

Disponibilizar tal laboratório como um serviço em nível nacional pode ser muito desafiador, pois a execução de aplicações como a DroidAugmentor e MalSynGen podem utilizar grandes recursos computacionais e de armazenamento, além de poder levar muitos dias ou semanas para um processamento ser concluído.

### Solução

Inspirado na ideia do [GitHub Actions](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners) onde os usuários podem dedicar máquinas para executar pipelines despachadas pelo GitHub, foi desenvolvido o Worker, que é uma aplicação separada da API, responsável por processar os jobs em background.

Essa aplicação foi desenvolvida especialmente buscando não expor a infraestrutura do servidor principal, mas se comunicando com a API Gateway através de Websocket/REST, permitindo a instância de múltiplos workers, em máquinas distintas, sem dependência de VPNs ou concessões de acesso, tornando o processo distribuído e seguro.

## Visão geral do projeto <a name="overview"></a>

O Worker está inserido no contexto do projeto AutoDroid, que é uma aplicação que visa oferecer a ferramenta DroidAugmentor/MalSynGen como um serviço.

<img src="./docs/assets/system-context.jpg" alt="Overview" style="fill:#000000">

## Tecnologias utilizadas <a name="built_using"></a>

- [TypeScript](https://www.typescriptlang.org/) - Linguagem de programação
- [Node.js](https://nodejs.org/) - Ambiente de execução
- [Docker](https://www.docker.com/) - conteinerização
- [Dockerode](https://github.com/apocas/dockerode) - API Docker
- [Vitest](https://vitest.dev/) - Framework de testes
- [Yarn](https://yarnpkg.com/) - Gerenciador de pacotes

### Geral

Ferramentas de desenvolvimento:

- [Git](https://git-scm.com/) - Controle de versão
- [Husky](https://typicode.github.io/husky/#/) - Hooks do Git
- [Lint Staged](https://github.com/okonet/lint-staged) - Ferramenta para verificar arquivos commitados
- [Commitizen](https://github.com/commitizen/cz-cli) - Auxiliar para mensagens de commit do Git
- [Commitlint](https://commitlint.js.org/) - Verificador de mensagens de commit do Git
- [release-please](https://github.com/googleapis/release-please) - Versões e changelog a partir dos commits
- [Eslint](https://eslint.org/) - Framework de verificação de código
- [Prettier](https://prettier.io/) - Formatador de código
- [Semver](https://semver.org/) - Versionamento semântico

## Ambiente do servidor <a name="server_environment"></a>

- Sistema operacional Linux (por exemplo, Ubuntu, Debian e outros...) (MacOS/Windows é experimental)
- Virtualização habilitada no BIOS
- Mínimo de 4GB de RAM
- Mínimo de 10GB de espaço livre em disco, dependendo dos "processadores" disponíveis (para arquivos, resultados de processamento e imagens Docker)
- [Git](https://git-scm.com/downloads) instalado
- [Docker](https://docs.docker.com/get-docker/) instalado

## Antes de começar <a name="before_start"></a>

Crie a instância do (AutoDroid API Gateway) conforme especificado no repositório principal [AutoDroid API](https://github.com/MalwareDataLab/AutoDroid). Para facilitar a configuração inicial, o repositório da API contém um [script de demonstração completo](https://github.com/MalwareDataLab/AutoDroid#uso) que automatiza todo o processo de configuração, incluindo a instalação e configuração do backend e do worker em um único ambiente. Este script é ideal para testes e desenvolvimento local.

Utilizando um usuário autenticado como administrador, crie um `WorkerRegistrationToken` na API Gateway, que será utilizado para autenticar o Worker com a API. Utilize o Postman, o SDK ou a linha de comando para executar esta ação.

Exemplo com `curl`:

```bash
curl --location 'http://localhost:3333/admin/worker/registration-token' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer <TOKEN>' \
--data '{
    "is_unlimited_usage": true
}'
```

Pela linha de comando, o mesmo resultado sai de `npx autodroid login` seguido de `npx autodroid admin worker-token create --is-unlimited-usage`. Obtenha o token pelo valor `token` retornado.

## Primeiros passos <a name="getting_started"></a>

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

Introduza a variável de ambiente `REGISTRATION_TOKEN` e um nome identificador `NAME` no arquivo `docker-compose.dev.yml` na raiz do projeto, com o valor obtido em [antes de começar](#before_start).

Inicie o projeto:

```bash
docker compose -f docker-compose.dev.yml up
```

Para parar a aplicação, pressione ```Ctrl + C``` no terminal ou execute ```docker compose -f docker-compose.dev.yml down``` na raiz deste repositório, caso esteja executando a aplicação em modo destacado.

Uma pasta `./.runtime` será criada na raiz deste repositório para armazenar os arquivos temporários da aplicação. Pode ser necessário permissões de superusuário para acessar, modificar ou excluir esta pasta.

Realize a utilização da aplicação conforme em [uso](https://github.com/MalwareDataLab/AutoDroid#uso).

### Instância manual <a name="manual_setup"></a>

Use Node.js 20 (a versão exata está em `.nvmrc`) e instale as dependências do projeto:

```bash
yarn install
```

Execute a instância de desenvolvimento utilizando:

```bash
yarn dev -u http://localhost:3333 -t <REGISTRATION_TOKEN> -n <NAME>
```

O Worker estará disponível para receber trabalhos.

### Testes

`yarn test` roda as camadas unitária, de integração e e2e, com meta de 100% de cobertura. As duas últimas precisam do Docker rodando: a de integração baixa a imagem `alpine:latest`, e a e2e constrói a imagem de teste em `test/fixtures/e2e-tool`. Cada camada roda sozinha com `yarn test:unit`, `yarn test:integration` e `yarn test:e2e`. `yarn lint` checa o lint e os tipos. O que cada camada simula está no [AGENTS.md](AGENTS.md).

## Implantação <a name="deployment"></a>

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

O worker só abre conexões de saída para a API, por HTTPS e WebSocket, e não precisa de portas de entrada. Verifique se a sua rede local e o seu provedor permitem essas conexões.

## Atualização <a name="updating"></a>

O docker compose está instrumentado com a ferramenta [watchtower](https://containrrr.dev/watchtower/) para atualizações automáticas.

Para realizar atualização manual, execute o seguinte comando:

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Solução de problemas <a name="troubleshooting"></a>

Alguns erros durante a execução da aplicação podem estar relacionados ao Docker.

### Erros antes da inicialização

Se você estiver enfrentando alguns erros antes da inicialização da aplicação, verifique os seguintes itens:

- Verifique se a máquina atende aos [requisitos](#server_environment).
- Verifique se todos os passos especificados em [antes de começar](#before_start) foram completados, refaça-os se necessário.
- Verifique se seu usuário possui permissões de uso ao Docker, executando o comando `docker run --rm hello-world:latest`.
- Realize os processos de pós-instalação do Docker, conforme [documentação oficial](https://docs.docker.com/engine/install/linux-postinstall/).

### Limpando o ambiente do Docker

Se você estiver enfrentando alguns erros relacionados ao Docker, você pode tentar limpar o ambiente do Docker executando os seguintes comandos:

```bash
# Pare todos os containers
docker compose -f docker-compose.prod.yml down
docker stop $(docker ps -q)

# Remova todos os arquivos da pasta runtime
sudo rm -rf ./.runtime

# Remova todas as imagens relacionadas a este projeto
docker rmi malwaredatalab/autodroid-worker:latest

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
docker compose -f docker-compose.prod.yml build --no-cache
```

Persistindo o erro, entre em contato com o mantenedor do projeto.

## Telemetria <a name="telemetry"></a>

O AutoDroid Worker pode ser monitorado através de uma solução de telemetria externa, composta por dois componentes:

### AutoDroid Watcher Server

O [AutoDroid Watcher Server](https://github.com/MalwareDataLab/autodroid-watcher-server) é um servidor que recebe dados de telemetria e conduz experimentos do software AutoDroid. Este servidor recebe a conexão de um ou mais clientes que devem ser instalados nas máquinas onde o AutoDroid Worker está instalado.

### AutoDroid Watcher Client

O [AutoDroid Watcher Client](https://github.com/MalwareDataLab/autodroid-watcher-client) é responsável por coletar os dados de telemetria e enviá-los para o servidor, além de iniciar os experimentos e a coleta de dados.

Para utilizar a solução de telemetria:

1. Instale o AutoDroid Watcher Server em uma máquina separada
2. Instale o AutoDroid Watcher Client em cada máquina onde o AutoDroid Worker está instalado
3. Configure o cliente para se conectar ao servidor de telemetria
4. Os resultados dos experimentos serão armazenados em arquivos CSV e gráficos, que podem ser utilizados para análise e visualização dos dados coletados

## Referências <a name="bibliography"></a>

LAVIOLA, Luiz Felipe; PAIM, Kayuã Oleques; KREUTZ, Diego; MANSILHA, Rodrigo Brandão. AutoDroid: disponibilizando a ferramenta DroidAugmentor como serviço. In: ESCOLA REGIONAL DE REDES DE COMPUTADORES (ERRC), 20. , 2023, Porto Alegre/RS. Anais [...]. Porto Alegre: Sociedade Brasileira de Computação, 2023 . p. 145-150. DOI: https://doi.org/10.5753/errc.2023.929.

LAVIOLA, Luiz Felipe; GASPAR DINIZ NOGUEIRA, Angelo; KREUTZ, Diego; BRANDÃO MANSILHA, Rodrigo. Cloud AutoDroid: uma Arquitetura de Backend para Executar Serviços de IA Generativa na Nuvem. In: ESCOLA REGIONAL DE ENGENHARIA DE SOFTWARE (ERES), 8. , 2024, Santiago/RS. Anais [...]. Porto Alegre: Sociedade Brasileira de Computação, 2024 . p. 258-267. DOI: https://doi.org/10.5753/eres.2024.4302.

CASOLA, Karina; PAIM, Kayuã Oleques; MANSILHA, Rodrigo Brandão; KREUTZ, Diego. DroidAugmentor: uma ferramenta de treinamento e avaliação de cGANs para geração de dados sintéticos. In: SALÃO DE FERRAMENTAS - SIMPÓSIO BRASILEIRO DE SEGURANÇA DA INFORMAÇÃO E DE SISTEMAS COMPUTACIONAIS (SBSEG), 23. , 2023, Juiz de Fora/MG. Anais [...]. Porto Alegre: Sociedade Brasileira de Computação, 2023 . p. 57-64. DOI: https://doi.org/10.5753/sbseg_estendido.2023.235793.

NOGUEIRA, Angelo Gaspar Diniz; PAIM, Kayua Oleques; BRAGANÇA, Hendrio; MANSILHA, Rodrigo; KREUTZ, Diego. MalSynGen: redes neurais artificiais na geração de dados tabulares sintéticos para detecção de malware. In: SALÃO DE FERRAMENTAS - SIMPÓSIO BRASILEIRO DE SEGURANÇA DA INFORMAÇÃO E DE SISTEMAS COMPUTACIONAIS (SBSEG), 24. , 2024, São José dos Campos/SP. Anais [...]. Porto Alegre: Sociedade Brasileira de Computação, 2024 . p. 129-136. DOI: https://doi.org/10.5753/sbseg_estendido.2024.243359.
