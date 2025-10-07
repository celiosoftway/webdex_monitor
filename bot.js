require("dotenv").config();
const { Telegraf, Scenes, session, Markup } = require("telegraf");
const sequelize = require("./db/database");

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

// Inicializar DB
(async () => {
    await sequelize.sync();
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
})();