require("dotenv").config();
const { Markup } = require("telegraf");
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const User = require("./models/User");
const { getHistoricoDados, getHistoricoDadosLiquido, getResumoPeriodo, historico } = require("./util/lucro");
const { getCMCPrice, getCachedCMCPrice } = require('./util/util');
const { getProtocolSpeed, formatProtocolSpeed } = require("./util/defi_speed");

const FILE_PATH = path.resolve('./unique_holders_24h.json');

// teclado do bot
const keyboard = Markup.keyboard([
    ["📈 Lucro", "💸 Lucro Líquido"],
    ["👛 Configurar", "📋 Ver Config"],
    ["🧠 Ajuda", "💬 Grupo Help"],
    ["📊 Gerar CSV"],
]).resize();

// comando start, envia uma mensagem em privato
async function startHandler(ctx) {
    if (ctx.chat.id != ctx.from.id) {
        ctx.reply('Oioi\n' +
            'Estou te enviando uma mensagem no privado, okay? ^^');

        bot.telegram.sendMessage(ctx.from.id, 'Oioi\n' +
            'Agora podemos conversar em particular ^^\n' +
            'Use o comando /help para ver a lista de comandos ^^');
    } else {
        ctx.replyWithMarkdown('keyboard iniciado',
            keyboard
        );
    }
    return true;
}

async function verConfigHandler(ctx) {
    console.log(verConfigHandler)

    const telegram_id = ctx.from.id.toString();
    const user = await User.findOne({ where: { telegram_id } });

    if (!user) {
        return ctx.reply("⚠️ Nenhuma configuração encontrada. Use /config para começar.");
    }

    console.log(user)

    const carteira = user.wallet || "❌ Não configurada";
    const rpc = user.rpc_url || "❌ Não configurado";
    const api = user.polygonscan_api_key || "❌ Não configurada";

    return ctx.reply(
        `🛠️ Suas configurações atuais:\n\n` +
        `👛 *Carteira:* \`${carteira}\`\n` +
        `🌐 *RPC da Polygon:* \`${rpc}\`\n` +
        `🔑 *PolygonScan API Key:* \`${api}\``,
        { parse_mode: "Markdown" }
    );
}

async function ajudaHandler(ctx) {
    await ctx.replyWithMarkdown("📘 *Guia de Configuração do WebDex Bot*\n\nEste bot precisa de 3 configurações para funcionar corretamente:");

    await ctx.replyWithMarkdown(
        "1️⃣ *Carteira (Wallet)*\n" +
        "É o endereço público da sua carteira de criptomoedas, usado para consultar saldo e transações.\n\n" +
        "📌 Exemplo: `0xA1b2C3d4E5F6a7B8c9D0E1F2A3B4C5D6E7F8G9H0`\n" +
        "🛡️ *Nunca* envie sua *chave privada*, apenas o endereço público.\n\n" +
        "Você pode obter esse endereço nos apps:\n" +
        "- MetaMask\n- TrustWallet\n- Ledger / Trezor (via MetaMask)"
    );

    await ctx.replyWithMarkdown(
        "2️⃣ *RPC da Polygon*\n" +
        "É o servidor usado pelo bot para se conectar à rede Polygon.Exemplo:\n" +
        "`https://polygon-rpc.com`\n\n" +
        "🔗 Recomendado:\n" +
        "Crie uma conta gratuita e obtenha um RPC em sites como:\n" +
        "*- Infura*\n" +
        "*- Alchemy*\n"
    );

    await ctx.replyWithMarkdown(
        "3️⃣ *Etherscan V2*\n" +
        "Permite ao bot consultar suas transações diretamente na blockchain.\n\n" +
        "🔑 Como obter:\n" +
        "1. Acesse: [https://etherscan.io/apidashboard](https://etherscan.io/apidashboard)\n" +
        "2. Faça login ou crie uma conta gratuita\n" +
        "3. Clique em *Add* ou *Create API Key*\n" +
        "4. Copie a chave gerada e salve no bot\n\n" +
        "📶 Essa chave é gratuita e segura."
    );

    await ctx.replyWithMarkdown(
        "⚙️ *Como configurar no bot:*\n" +
        "Use o comando `/config` e escolha uma das opções:\n\n" +
        "👛 *Carteira*\n🌐 *RPC da Polygon*\n🔑 *PolygonScan API Key*"
    );

    await ctx.replyWithMarkdown(
        "📩 *Dúvidas ou problemas?*\n" +
        "Fale com o desenvolvedor ou envie seu feedback direto pelo bot!"
    );
}

// cálculo do lucro líquido e percentual ajustado
function getLucroLiquido(resumo, gasUsd) {
    const lucroBrutoUsd = resumo.lucroDia || resumo.valor || 0; // lucro em token colateral
    const lucroLiquidoUsd = lucroBrutoUsd - gasUsd;
    const percentualLiquido = ((lucroLiquidoUsd / Math.abs(lucroBrutoUsd)) * resumo.percentual) || 0;
    return { lucroLiquidoUsd, percentualLiquido };
}

async function lucroHandler(ctx) {
    const telegram_id = ctx.from.id.toString();
    const user = await User.findOne({ where: { telegram_id } });

    if (!user || !user.wallet)
        return ctx.reply("❌ Você precisa configurar sua carteira usando /config");

    if (!user.rpc_url)
        return ctx.reply("❌ Você precisa configurar o RPC usando /config");

    if (!user.polygonscan_api_key)
        return ctx.reply("❌ Você precisa configurar sua chave PolygonScan API usando /config");

    const carteira = user.wallet;
    const apikey = user.polygonscan_api_key;

    let colateral = process.env.TOKEN_COLATERAL_ADDRESS
    if (user.telegram_id === '7433193517000') {
        colateral = process.env.LOOP_COLATERAL
    };

    try {
        const polUsdPrice = await getCachedCMCPrice();

        const { resultado: dados, lucro24h } = await getHistoricoDados(carteira, apikey, colateral);
        const resumo0d = getResumoPeriodo(dados, 0);
        const resumo1d = getResumoPeriodo(dados, 1);
        const resumo7d = getResumoPeriodo(dados, 7);
        const resumo30d = getResumoPeriodo(dados, 30);

        const gasUsdresumo0d = resumo0d.gasPeriodo * polUsdPrice;
        const gasUsdlucro24h = lucro24h.gasTotal * polUsdPrice;
        const gasUsdresumo1d = resumo1d.gasPeriodo * polUsdPrice;
        const gasUsdresumo7d = resumo7d.gasPeriodo * polUsdPrice;
        const gasUsdresumo30d = resumo30d.gasPeriodo * polUsdPrice;

        // adiciona cálculo de lucro líquido
        const l0 = getLucroLiquido(resumo0d, gasUsdresumo0d);
        const l24 = getLucroLiquido(lucro24h, gasUsdlucro24h);
        const l1 = getLucroLiquido(resumo1d, gasUsdresumo1d);
        const l7 = getLucroLiquido(resumo7d, gasUsdresumo7d);
        const l30 = getLucroLiquido(resumo30d, gasUsdresumo30d);

        const webdex = 0.009630000000;

        // adiciona cálculo de lucro líquido
        const wl0 = resumo0d.totalOperacoes * webdex;
        const wl24 = lucro24h.totalOperacoes * webdex;
        const wl1 = resumo1d.totalOperacoes * webdex;
        const wl7 = resumo7d.totalOperacoes * webdex;
        const wl30 = resumo30d.totalOperacoes * webdex;

        let mensagem = ``;
        mensagem += `*Resultado da automação WeBDex Defi*\n\n`;
        mensagem += `📅 *Hoje*\n`;
        mensagem += `🧾 ${resumo0d.totalOperacoes} operações (${wl0.toFixed(5)} WeBDex)\n`;
        mensagem += `📊 OP: ${resumo0d.totalLucroBruto.toFixed(3)} | 📛 ${resumo0d.totalPerdaBruta.toFixed(3)}\n`;
        mensagem += `💰 Lucro: ${resumo0d.lucroDia.toFixed(3)} (${resumo0d.percentual.toFixed(2)}%)\n\n`;

        mensagem += `📅 *Últimas 24 horas*\n`;
        mensagem += `🧾 ${lucro24h.totalOperacoes} operações (${wl24.toFixed(5)} WeBDex)\n`;
        mensagem += `📊 OP: ${lucro24h.totalLucroBruto.toFixed(3)} | 📛 ${lucro24h.totalPerdaBruta.toFixed(3)}\n`;
        mensagem += `💰 Lucro: ${lucro24h.valor.toFixed(3)} (${lucro24h.percentual.toFixed(2)}%)\n\n`;

        mensagem += `📅 *Último dia*\n`;
        mensagem += `🧾 ${resumo1d.totalOperacoes} operações (${wl1.toFixed(5)} WeBDex)\n`;
        mensagem += `📊 OP: ${resumo1d.totalLucroBruto.toFixed(3)} | 📛 ${resumo1d.totalPerdaBruta.toFixed(3)}\n`;
        mensagem += `💰 Lucro: ${resumo1d.lucroDia.toFixed(3)} (${resumo1d.percentual.toFixed(2)}%)\n\n`;

        mensagem += `📅 *Últimos 7 dias*\n`;
        mensagem += `🧾 ${resumo7d.totalOperacoes} operações (${wl7.toFixed(5)} WeBDex)\n`;
        mensagem += `📊 OP: ${resumo7d.totalLucroBruto.toFixed(3)} | 📛 ${resumo7d.totalPerdaBruta.toFixed(3)}\n`;
        mensagem += `💰 Lucro: ${resumo7d.lucroDia.toFixed(3)} (${resumo7d.percentual.toFixed(2)}%)\n\n`;

        mensagem += `📅 *Últimos 30 dias*\n`;
        mensagem += `🧾 ${resumo30d.totalOperacoes} operações (${wl30.toFixed(5)} WeBDex)\n`;
        mensagem += `📊 OP: ${resumo30d.totalLucroBruto.toFixed(3)} | 📛 ${resumo30d.totalPerdaBruta.toFixed(3)}\n`;
        mensagem += `💸 Lucro: ${resumo30d.lucroDia.toFixed(3)} (${resumo30d.percentual.toFixed(2)}%)\n\n`;

        await ctx.reply(mensagem, { parse_mode: "Markdown" });
    } catch (err) {
        console.error("Erro ao calcular lucro:", err);
        ctx.reply("❌ Erro ao calcular lucro.");
    }
}

async function lucroLiquidoHandler(ctx) {
    const telegram_id = ctx.from.id.toString();
    const user = await User.findOne({ where: { telegram_id } });

    if (!user || !user.wallet)
        return ctx.reply("❌ Você precisa configurar sua carteira usando /config");

    if (!user.rpc_url)
        return ctx.reply("❌ Você precisa configurar o RPC usando /config");

    if (!user.polygonscan_api_key)
        return ctx.reply("❌ Você precisa configurar sua chave PolygonScan API usando /config");

    const carteira = user.wallet;
    const apikey = user.polygonscan_api_key;
    const rpc_url = user.rpc_url

    let colateral = process.env.TOKEN_COLATERAL_ADDRESS
    if (user.telegram_id === '7433193517000') {
        colateral = process.env.LOOP_COLATERAL
    };

    try {
        await ctx.reply("🔄 Aguarde... Calculando lucro líquido", { parse_mode: "Markdown" });

        const polUsdPrice = await getCachedCMCPrice();

        const { resultado: dados, lucro24h } = await getHistoricoDadosLiquido(carteira, apikey, colateral,rpc_url);
        const resumo0d = getResumoPeriodo(dados, 0);
        const resumo1d = getResumoPeriodo(dados, 1);
        const resumo7d = getResumoPeriodo(dados, 7);
        const resumo30d = getResumoPeriodo(dados, 30);

        const gasUsdresumo0d = resumo0d.gasPeriodo * polUsdPrice;
        const gasUsdlucro24h = lucro24h.gasTotal * polUsdPrice;
        const gasUsdresumo1d = resumo1d.gasPeriodo * polUsdPrice;
        const gasUsdresumo7d = resumo7d.gasPeriodo * polUsdPrice;
        const gasUsdresumo30d = resumo30d.gasPeriodo * polUsdPrice;

        // adiciona cálculo de lucro líquido
        const l0 = getLucroLiquido(resumo0d, gasUsdresumo0d);
        const l24 = getLucroLiquido(lucro24h, gasUsdlucro24h);
        const l1 = getLucroLiquido(resumo1d, gasUsdresumo1d);
        const l7 = getLucroLiquido(resumo7d, gasUsdresumo7d);
        const l30 = getLucroLiquido(resumo30d, gasUsdresumo30d);

        const webdex = 0.009630000000;

        // adiciona cálculo de lucro líquido
        const wl0 = resumo0d.totalOperacoes * webdex;
        const wl24 = lucro24h.totalOperacoes * webdex;
        const wl1 = resumo1d.totalOperacoes * webdex;
        const wl7 = resumo7d.totalOperacoes * webdex;
        const wl30 = resumo30d.totalOperacoes * webdex;

        let mensagem = ``;
        mensagem += `*Resultado da automação WeBDex Defi*\n\n`;
        mensagem += `📅 *Hoje*\n`;
        mensagem += `🧾 ${resumo0d.totalOperacoes} operações (${wl0.toFixed(5)} WeBDex)\n`;
        mensagem += `⛽ ${resumo0d.gasPeriodo.toFixed(3)} POL (${gasUsdresumo0d.toFixed(3)} USD)\n`;
        mensagem += `📊 OP: ${resumo0d.totalLucroBruto.toFixed(3)} | 📛 ${resumo0d.totalPerdaBruta.toFixed(3)}\n`;
        mensagem += `💰 Lucro: ${resumo0d.lucroDia.toFixed(3)} (${resumo0d.percentual.toFixed(2)}%)\n`;
        mensagem += `💸 Líquido: ~${l0.lucroLiquidoUsd.toFixed(3)} (${l0.percentualLiquido.toFixed(2)}%)\n\n`;

        mensagem += `📅 *Últimas 24 horas*\n`;
        mensagem += `🧾 ${lucro24h.totalOperacoes} operações (${wl24.toFixed(5)} WeBDex)\n`;
        mensagem += `⛽ ${lucro24h.gasTotal.toFixed(3)} POL (${gasUsdlucro24h.toFixed(3)} USD)\n`;
        mensagem += `📊 OP: ${lucro24h.totalLucroBruto.toFixed(3)} | 📛 ${lucro24h.totalPerdaBruta.toFixed(3)}\n`;
        mensagem += `💰 Lucro: ${lucro24h.valor.toFixed(3)} (${lucro24h.percentual.toFixed(2)}%)\n`;
        mensagem += `💸 Líquido: ~${l24.lucroLiquidoUsd.toFixed(3)} (${l24.percentualLiquido.toFixed(2)}%)\n\n`;

        mensagem += `📅 *Último dia*\n`;
        mensagem += `🧾 ${resumo1d.totalOperacoes} operações (${wl1.toFixed(5)} WeBDex)\n`;
        mensagem += `⛽ ${resumo1d.gasPeriodo.toFixed(3)} POL (${gasUsdresumo1d.toFixed(3)} USD)\n`;
        mensagem += `📊 OP: ${resumo1d.totalLucroBruto.toFixed(3)} | 📛 ${resumo1d.totalPerdaBruta.toFixed(3)}\n`;
        mensagem += `💰 Lucro: ${resumo1d.lucroDia.toFixed(3)} (${resumo1d.percentual.toFixed(2)}%)\n`;
        mensagem += `💸 Líquido: ~${l1.lucroLiquidoUsd.toFixed(3)} (${l1.percentualLiquido.toFixed(2)}%)\n\n`;

        mensagem += `📅 *Últimos 7 dias*\n`;
        mensagem += `🧾 ${resumo7d.totalOperacoes} operações (${wl7.toFixed(5)} WeBDex)\n`;
        mensagem += `⛽ ${resumo7d.gasPeriodo.toFixed(3)} POL (${gasUsdresumo7d.toFixed(3)} USD)\n`;
        mensagem += `📊 OP: ${resumo7d.totalLucroBruto.toFixed(3)} | 📛 ${resumo7d.totalPerdaBruta.toFixed(3)}\n`;
        mensagem += `💰 Lucro: ${resumo7d.lucroDia.toFixed(3)} (${resumo7d.percentual.toFixed(2)}%)\n`;
        mensagem += `💸 Líquido: ~${l7.lucroLiquidoUsd.toFixed(3)} (${l7.percentualLiquido.toFixed(2)}%)\n\n`;

        mensagem += `📅 *Últimos 30 dias*\n`;
        mensagem += `🧾 ${resumo30d.totalOperacoes} operações (${wl30.toFixed(5)} WeBDex)\n`;
        mensagem += `⛽ ${resumo30d.gasPeriodo.toFixed(3)} POL (${gasUsdresumo30d.toFixed(3)} USD)\n`;
        mensagem += `📊 OP: ${resumo30d.totalLucroBruto.toFixed(3)} | 📛 ${resumo30d.totalPerdaBruta.toFixed(3)}\n`;
        mensagem += `💸 Lucro: ${resumo30d.lucroDia.toFixed(3)} (${resumo30d.percentual.toFixed(2)}%)\n`;
        mensagem += `💰 Líquido: ~${l30.lucroLiquidoUsd.toFixed(3)} (${l30.percentualLiquido.toFixed(2)}%)\n\n`;

        await ctx.reply(mensagem, { parse_mode: "Markdown" });
    } catch (err) {
        console.error("Erro ao calcular lucro:", err);
        ctx.reply("❌ Erro ao calcular lucro.");
    }
}

async function csvHandler(ctx) {
    const telegram_id = ctx.from.id.toString();
    const user = await User.findOne({ where: { telegram_id } });

    if (!user || !user.wallet) {
        return ctx.reply("❌ Você precisa configurar sua carteira usando /config");
    }

    if (!user.rpc_url) {
        return ctx.reply("❌ Você precisa configurar o RPC usando /config");
    }

    if (!user.polygonscan_api_key) {
        return ctx.reply("❌ Você precisa configurar sua chave PolygonScan API usando /config");
    }

    const carteira = user.wallet;
    const apikey = user.polygonscan_api_key;
    const colateral = process.env.TOKEN_COLATERAL_ADDRESS;

    try {
        const csv = await historico(carteira, apikey, colateral);

        // Transforma em buffer e envia
        const csvBuffer = Buffer.from(csv.join('\n'), 'utf-8');

        await ctx.replyWithDocument({
            source: csvBuffer,
            filename: `relatorio_sintetico.csv`
        });

    } catch (error) {
        console.error("Erro ao exibir histórico:", error);
        ctx.reply("❌ Erro ao buscar histórico.");
    }
}

async function testApiHandler(ctx) {
    const telegram_id = ctx.from.id.toString();
    const user = await User.findOne({ where: { telegram_id } });

    // 🔹 Verificações de configuração
    if (!user || !user.wallet) {
        return ctx.reply("❌ Você precisa configurar sua carteira usando /config");
    }

    if (!user.rpc_url) {
        return ctx.reply("❌ Você precisa configurar o RPC usando /config");
    }

    if (!user.polygonscan_api_key) {
        return ctx.reply("❌ Você precisa configurar sua chave *PolygonScan API* usando /config");
    }

    const carteira = user.wallet;
    const apikey = user.polygonscan_api_key;
    const colateral = process.env.TOKEN_COLATERAL_ADDRESS;

    const BASE_API_URL_V2 = "https://api.etherscan.io/v2/api";
    const POLYGON_CHAIN_ID = 137;

    const params = {
        chainid: POLYGON_CHAIN_ID,
        module: "account",
        action: "tokentx",
        address: carteira,
        contractaddress: colateral,
        sort: "desc",
        apikey: apikey
    };

    const apiUrl = `${BASE_API_URL_V2}?${new URLSearchParams(params).toString()}`;

    try {
        const { data } = await axios.get(apiUrl);

        // ------------------------------------------
        // 🔍 TRATAMENTO DOS CASOS
        // ------------------------------------------

        // ❌ API key inválida
        if (data.status === "0" && data.message.includes("Invalid API Key")) {
            return ctx.reply(
                `❌ *API Key inválida*\n` +
                `Verifique se você colou a chave correta.\n\n` +
                `🔗 [Abrir PolygonScan](https://polygonscan.com/myapikey)`,
                { parse_mode: "Markdown" }
            );
        }

        // ❌ Nenhuma transação encontrada
        if (data.status === "0" && data.message === "No transactions found") {
            return ctx.reply(
                `ℹ️ Sua configuração está *válida*, mas não encontrei transações deste token.\n\n` +
                `🔗 [Verificar carteira no PolygonScan](https://polygonscan.com/address/${carteira})`,
                { parse_mode: "Markdown" }
            );
        }

        // ❌ Qualquer erro inesperado
        if (data.status === "0") {
            return ctx.reply(
                `⚠️ *A API retornou um erro*\n` +
                `Mensagem: _${data.message}_\n\n` +
                `🔗 [Ver detalhes no PolygonScan](https://polygonscan.com/address/${carteira})`,
                { parse_mode: "Markdown" }
            );
        }

        // ✅ Ok — transações encontradas
        if (data.status === "1") {
            return ctx.reply(
                `✅ *Conexão bem-sucedida!*\n` +
                `Foram encontradas *${data.result.length} transações*.\n\n` +
                `🔗 [Ver transações no PolygonScan](https://polygonscan.com/token/${colateral}?a=${carteira})`,
                { parse_mode: "Markdown" }
            );
        }

        // 🟡 fallback improvável
        return ctx.reply("⚠️ Resposta inesperada da API. Tente novamente mais tarde.");

    } catch (error) {
        console.error("Erro ao consultar API:", error);

        return ctx.reply(
            `❌ *Erro ao consultar API*\n` +
            `Verifique sua conexão ou tente novamente mais tarde.`,
            { parse_mode: "Markdown" }
        );
    }
}

async function defiSpeedHandler(ctx) {
    try {
        const data = await fs.readFile(FILE_PATH, 'utf-8');
        const json = JSON.parse(data);

        // 1) obter número total de contas
        const total = json.uniqueHolders || 1;

        // 2) medir velocidade do protocolo
        const speed = await getProtocolSpeed(total);
        console.log(speed);

        const formata = await formatProtocolSpeed(speed, total)

        // console.log("Total contas:", total);
        console.log(formata);

        return ctx.reply(
            `${formata}\n`,
            { parse_mode: "Markdown" }
        );

    } catch (error) {
        console.error(error);

        return ctx.reply(
            `❌ *Erro ao estimar o ciclo*\n` +
            `Verifique sua conexão ou tente novamente mais tarde.`,
            { parse_mode: "Markdown" }
        );
    }
}

module.exports = {
    startHandler,
    ajudaHandler,
    verConfigHandler,
    lucroHandler,
    csvHandler,
    testApiHandler,
    defiSpeedHandler,
    lucroLiquidoHandler
};
