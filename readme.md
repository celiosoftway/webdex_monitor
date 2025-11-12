# 🤖 WeBDex Monitor Bot

<img src="banner.jpg" align="middle">

O projeto é um **bot do Telegram** desenvolvido em Node.js, utilizando o framework Telegraf, com o objetivo principal de **monitorar transações de abertura de posição (`openPosition`)** em uma blockchain (especificamente a rede Polygon) e notificar o usuário em tempo real. Além disso, o bot oferece funcionalidades para **cálculo de lucro/prejuízo** e **exportação de histórico** de transações em formato CSV.

## 🌟 Funcionalidades Principais

| Funcionalidade | Descrição | Comandos/Ações |
| :--- | :--- | :--- |
| **Monitoramento de Posições** | Monitora a blockchain em busca de novas transações `openPosition` na carteira configurada e envia notificações instantâneas via Telegram. | Monitoramento automático (a cada 60 segundos). |
| **Relatório de Lucro** | Calcula e exibe o resumo de lucro/prejuízo em diferentes períodos (hoje, últimas 24h, 7 dias, 30 dias), baseado nas transações de `openPosition` e `LiquidityAdd/Remove`. | `📈 Lucro` |
| **Exportação CSV** | Gera um arquivo CSV com o histórico detalhado de transações e métricas de lucro por dia. | `📊 Gerar CSV` |
| **Configuração de Contas** | Permite cadastrar apelidos (`friendly_name`) para IDs de contas específicas, facilitando a identificação nas notificações. | `/config_contas` |
| **Configuração de Acesso** | Interface de conversação (Scenes) para configurar a carteira, URL do RPC da Polygon e a chave da PolygonScan API. | `👛 Configurar` |

## 🛠️ Tecnologias Utilizadas

O projeto é construído sobre uma pilha de tecnologias Node.js:

*   **Linguagem:** JavaScript (Node.js)
*   **Framework do Bot:** [Telegraf](https://telegraf.js.org/)
*   **Interação com Blockchain:** [Ethers.js](https://docs.ethers.org/v6/)
*   **API de Dados:** PolygonScan API (via Etherscan V2 API)
*   **Banco de Dados:** [Sequelize](https://sequelize.org/) (Configurado para **MySQL/MariaDB**)
*   **Gerenciamento de Configurações:** Variáveis de Ambiente (`dotenv`)

## ⚙️ Configuração e Instalação

### 1. Pré-requisitos

Você precisará ter instalado:

*   [Node.js](https://nodejs.org/) (versão LTS recomendada)
*   [MySQL](https://www.mysql.com/) ou [MariaDB](https://mariadb.org/) (para o banco de dados)
*   Uma conta no Telegram e um **BOT_TOKEN** (obtido via [@BotFather](https://t.me/BotFather))
*   Uma **PolygonScan API Key** (obtida em [polygonscan.com/myapikey](https://polygonscan.com/myapikey))

### 2. Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto e preencha com as seguintes variáveis:

```dotenv
# --- Configuração do Bot ---
BOT_TOKEN="SEU_TOKEN_DO_TELEGRAM"

# --- Configuração do Banco de Dados (MySQL/MariaDB) ---
BD_HOST="localhost"
BD_BANCO="nome_do_banco"
BD_USER="usuario_do_banco"
BD_SENHA="senha_do_banco"

# --- Configurações da Blockchain (Geral) ---
# RPC usado para decodificar transações (pode ser um RPC público ou privado)
RPC_GLOBAL="https://polygon-rpc.com" 
# Endereço do token colateral que será monitorado (ex: LPUSDT)
TOKEN_COLATERAL_ADDRESS="0x..." 

# --- Configurações Pessoais (Serão salvas no DB via bot, mas podem ser definidas aqui para testes) ---
# CARTEIRA="0x..."
# POLYGONSCAN_API_KEY="SUA_CHAVE_AQUI"
```

### 3. Instalação das Dependências

Navegue até o diretório do projeto e instale as dependências:

```bash
npm install
```

### 4. Inicialização

Inicie o bot com o Node.js:

```bash
node bot.js
```

O bot irá se conectar ao banco de dados, sincronizar os modelos e iniciar o monitoramento de transações a cada 60 segundos.


## 📚 Estrutura do Projeto

| Arquivo | Função |
| :--- | :--- |
| `bot.js` | Ponto de entrada do bot, inicializa o Telegraf, o banco de dados, configura as Scenes e inicia o loop de monitoramento. |
| `handler.js` | Contém as funções de *handler* para os comandos e ações do bot (`/start`, `📈 Lucro`, `📊 Gerar CSV`, etc.). |
| `contrato.js` | Funções de baixo nível para interação com a blockchain, como buscar transações de token via API e decodificar dados de entrada de transações (`decodeTransactionInput`) usando Ethers.js. |
| `lucro.js` | Lógica de negócios para calcular o histórico de lucro/prejuízo, agregando transações por dia e calculando a Porcentagem Ponderada por Tempo (PPT). |
| `util.js` | Funções utilitárias, como formatação de datas e identificação do tipo de operação com base no nome da função. |
| `database.js` | Configuração da conexão com o banco de dados (MySQL/MariaDB). |
| `User.js` | Modelo Sequelize para armazenar as configurações de cada usuário (ID do Telegram, carteira, RPC, API Key). |
| `AccountAlias.js` | Modelo Sequelize para armazenar apelidos amigáveis para IDs de contas. |
| `config*.js` | Arquivos de Scenes do Telegraf para gerenciar o fluxo de configuração da carteira, RPC, API Key e contas. |
