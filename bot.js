require("dotenv").config();
const { Telegraf, Scenes, session, Markup } = require("telegraf");
const sequelize = require("./db/database");
const User = require("./models/User");

const bot = new Telegraf(process.env.BOT_TOKEN);

const carteiraScene = require("./scenes/configCarteiraScene");
const rpcScene = require("./scenes/configRpcScene");
const apiKeyScene = require("./scenes/configApiKeyScene");

const {
    startHandler,
    ajudaHandler,
    verConfigHandler,
    lucroHandler,
    csvHandler } = require("./handler");

const {getTokenTransactions} = require("./util/contrato");
const {formatarData} =require("./util/util");

// Inicializar DB
(async () => {
    await sequelize.sync({ alter: true });
})();

// Configurar Stage com Scenes
const stage = new Scenes.Stage([
    carteiraScene,
    rpcScene,
    apiKeyScene
]);

bot.use(session());
bot.use(stage.middleware());

// exibe o atalho dos comandos no Telegran
bot.telegram.setMyCommands([
    { command: 'start', description: 'inicia o teclado' },
]);

// Comandos, será chamado a função do handler
bot.command("start", startHandler);

// hears executa quando digitado o texto monitorado, neste caso o texto vem do keyboard
bot.hears("🧠 Ajuda", ajudaHandler);
bot.hears("📋 Ver Config", verConfigHandler);
bot.hears("📈 Lucro", lucroHandler);
bot.hears("📊 Gerar CSV", csvHandler);

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

            try {
                const transacoes = await getTokenTransactions(
                    user.wallet,
                    process.env.TOKEN_COLATERAL_ADDRESS,
                    user.polygonscan_api_key
                );

                const novas = transacoes.filter(tx =>
                    tx.functionName === "openPosition" &&     // garantir que é openPosition
                    !notificados.has(tx.transactionHash) &&
                    tx.timestamp >= inicioMonitoramento
                );

                for (const tx of novas) {
                    const perdaIcone = tx.amount.startsWith("-") ? "🔻 " : "";
                    let mensagem = `🚨 *Nova openPosition detectada!*\n`;
                    mensagem += `🔗 [Ver Transação](https://polygonscan.com/tx/${tx.transactionHash})\n\n`;
                    mensagem += `💰 Quantia: ${perdaIcone}${tx.amount}\n`;
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