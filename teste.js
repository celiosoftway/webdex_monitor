require("dotenv").config();
const { getHistoricoDados, getResumoPeriodo, historico } = require("./util/lucro");
const { getCMCPrice, getCachedCMCPrice } = require('./util/util');

const carteira = '0xbDb9d76E9917a4A6993A9D66cDEF5F42F07f3234';
const apikey = 'NC1JUZZWX9Y4JPC6IP852GHG1ISF17TVWM';
const colateral = '0xfb2e2ff7b51c2bcaf58619a55e7d2ff88cfd8aca';

// cálculo do lucro líquido e percentual ajustado
function getLucroLiquido(resumo, gasUsd) {
    const lucroBrutoUsd = resumo.lucroDia || resumo.valor || 0; // lucro em token colateral
    const lucroLiquidoUsd = lucroBrutoUsd - gasUsd;
    const percentualLiquido = ((lucroLiquidoUsd / Math.abs(lucroBrutoUsd)) * resumo.percentual) || 0;
    return { lucroLiquidoUsd, percentualLiquido };
}


(async () => {
    const polUsdPrice = await getCachedCMCPrice();

    const { resultado: dados, lucro24h } = await getHistoricoDados(carteira, apikey, colateral);
 
    const resumo0d = getResumoPeriodo(dados, 0);
    const resumo1d = getResumoPeriodo(dados, 1);
    const resumo7d = getResumoPeriodo(dados, 7);
    const resumo30d = getResumoPeriodo(dados, 30);

    console.log(resumo1d)

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

    console.log(mensagem);
})()