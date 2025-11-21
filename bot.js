require("dotenv").config();
const { Telegraf, Scenes, session, Markup } = require("telegraf");

// Banco de dados
const sequelize = require("./db/database");
const User = require("./models/User");
const AccountAlias = require("./models/AccountAlias");

const bot = new Telegraf(process.env.BOT_TOKEN);

// scenes
const carteiraScene = require("./scenes/configCarteiraScene");
const rpcScene = require("./scenes/configRpcScene");
const apiKeyScene = require("./scenes/configApiKeyScene");
const configContasScene = require("./scenes/configContasScene");

const {
    startHandler,
    ajudaHandler,
    verConfigHandler,
    lucroHandler,
    csvHandler,
    testApiHandler
} = require("./handler");

const { getTokenTransactions, decodeTransactionInput } = require("./util/contrato");
const { formatarData, getCMCPrice, getCachedCMCPrice } = require("./util/util");

// Inicializar DB
(async () => {
    await sequelize.sync();
})();

// Configurar Stage com Scenes
const stage = new Scenes.Stage([
    carteiraScene,
    rpcScene,
    apiKeyScene,
    configContasScene
]);

bot.use(session());
bot.use(stage.middleware());

// exibe o atalho dos comandos no Telegran
bot.telegram.setMyCommands([
    { command: 'start', description: 'inicia o teclado' },
    { command: 'config_contas', description: 'Configura contas' },
    { command: 'test_api', description: 'Executa teste de consulta' },
]);

// Comandos, será chamado a função do handler
bot.command("start", startHandler);
bot.command("test_api", testApiHandler);
bot.command("config_contas", (ctx) => ctx.scene.enter("config-contas"));

// hears executa quando digitado o texto monitorado, neste caso o texto vem do keyboard
bot.hears("🧠 Ajuda", ajudaHandler);
bot.hears("📋 Ver Config", verConfigHandler);
bot.hears("📈 Lucro", lucroHandler);
bot.hears("📊 Gerar CSV", csvHandler);

let helpGroup = `[Grupo para dúvidas](https://t.me/+y9SU2a60q_s5Mzkx)\n\n`;
bot.hears("💬 Grupo Help", (ctx) => ctx.reply(helpGroup, { parse_mode: "Markdown" }));

bot.hears("👛 Configurar", async (ctx) => {
    return ctx.reply("⚙️ Escolha o que deseja configurar:", Markup.inlineKeyboard([
        [Markup.button.callback("👛 Carteira", "configCarteira")],
        [Markup.button.callback("🌐 RPC da Polygon", "configRPC")],
        [Markup.button.callback("🔑 PolygonScan API Key", "configAPIKey")],
    ]));
});

// bot.action é a ação executada pelo bot.hears
bot.action("configCarteira", (ctx) => ctx.scene.enter("config-carteira"));
bot.action("configRPC", (ctx) => ctx.scene.enter("config-rpc"));
bot.action("configAPIKey", (ctx) => ctx.scene.enter("config-apikey"));


// Cache simples por usuário para evitar notificações duplicadas
let notificados = new Set();
const inicioMonitoramento = Math.floor(Date.now() / 1000); // timestamp em segundos

//debug
// const HORAS_ATRAS = 6; // escolha quantas horas
// let inicioMonitoramento = Math.floor(Date.now() / 1000) - (HORAS_ATRAS * 60 * 60);


async function monitorarOpenPositions() {
    console.clear();
    try {
        const usuarios = await User.findAll();
        console.log(`🕵️‍♂️ Verificando ${usuarios.length} usuários com monitoramento...`);

        for (const user of usuarios) {
            if (!user.wallet || !user.rpc_url || !user.polygonscan_api_key) continue;

            console.log(`\nVerificando usuario ${user.telegram_id}`)

            let colateral = process.env.TOKEN_COLATERAL_ADDRESS

            if (user.telegram_id === '7433193517') {
                colateral = process.env.LOOP_COLATERAL
            };

            try {
                const transacoes = await getTokenTransactions(
                    user.wallet,
                    colateral,
                    user.polygonscan_api_key
                );

                const novas = transacoes.filter(tx =>
                    tx.functionName === "openPosition" &&
                    !notificados.has(tx.transactionHash) &&
                    tx.timestamp >= inicioMonitoramento
                );

                const polUsdPrice = await getCachedCMCPrice();

                for (const tx of novas) {
                    const perdaIcone = tx.amount.startsWith("-") ? "🔻 " : "";
                    const decode = await decodeTransactionInput(tx.transactionHash);
                    const conta = decode?.args?.accountId?.[0] || 'unknown';

                    const gasUSD = tx.gasValor * polUsdPrice;

                    let contaDisplay = conta;
                    if (conta !== 'unknown') {
                        const alias = await AccountAlias.findOne({
                            where: { telegram_id: user.telegram_id, account_id: conta }
                        });
                        if (alias) {
                            contaDisplay = alias.friendly_name;
                        }
                    }

                    let mensagem = `🚨 *Nova openPosition detectada!*\n`;
                    mensagem += `🆔 Conta: ${contaDisplay}\n`;
                    mensagem += `🔗 [Ver Transação](https://polygonscan.com/tx/${tx.transactionHash})\n\n`;

                    mensagem += `💰 Quantia: ${perdaIcone}${tx.amount}\n`;
                    mensagem += `⛽ Gas: ${tx.gasValor} (${gasUSD.toFixed(3)} USD) \n`;
                    mensagem += `📅 Data: ${formatarData(tx.timestamp)}\n`;

                    await bot.telegram.sendMessage(user.telegram_id, mensagem, {
                        parse_mode: "Markdown"
                    });

                    notificados.add(tx.transactionHash);
                }

            } catch (err) {
                console.error("Erro ao monitorar transações:", err);
            }

        }

    } catch (err) {
        console.error("❌ Erro geral no monitoramento de openPositions:", err);
    }
}

// tratar erros
bot.catch((err, ctx) => {
    console.error("❌ Erro global capturado:");
    console.error("Chat ID:", ctx?.chat?.id);
    console.error("Update:", ctx?.update);
    console.error(err);
});

// 🔁 Inicializa bot e monitoramento
(async () => {

    try {
        await sequelize.authenticate();
        console.log("✅ Conectado ao banco de dados SQLite.");
        await sequelize.sync({ alter: true });

    } catch (error) {
        console.error("Erro geral:", error);
    }

    bot.launch({ dropPendingUpdates: true });
    console.log("🤖 Bot rodando com Scenes...");

    monitorarOpenPositions();
    setInterval(monitorarOpenPositions, 60000); // 30.000ms = 30s
})();