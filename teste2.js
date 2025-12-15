require("dotenv").config();
const { getResumoPeriodo, historico, calculaPPT } = require("./util/lucro");
const { getCMCPrice,
    getCachedCMCPrice,
    identificarTipoOperacaoPorNome,
    formatarDataSimples
} = require('./util/util');

const ethers = require('ethers');

const carteira = '0x5F5b2562c6ca05dD0A0B46DfE169DE7BCBaB72f2';
const apikey = 'NC1JUZZWX9Y4JPC6IP852GHG1ISF17TVWM';
const colateral = '0xfb2e2ff7b51c2bcaf58619a55e7d2ff88cfd8aca';


// cálculo do lucro líquido e percentual ajustado
function getLucroLiquido(resumo, gasUsd) {
    const lucroBrutoUsd = resumo.lucroDia || resumo.valor || 0; // lucro em token colateral
    const lucroLiquidoUsd = lucroBrutoUsd - gasUsd;
    const percentualLiquido = ((lucroLiquidoUsd / Math.abs(lucroBrutoUsd)) * resumo.percentual) || 0;
    return { lucroLiquidoUsd, percentualLiquido };
}

async function getHistoricoDados(carteira, api, token) {
    const signerAddress = carteira || process.env.CARTEIRA;
    const apiKey = api || process.env.POLYGONSCAN_API_KEY;
    const colateral = token || process.env.TOKEN_COLATERAL_ADDRESS;

    const params = new URLSearchParams({
        chainid: '137',
        module: 'account',
        action: 'tokentx',
        address: signerAddress,
        contractaddress: colateral,
        sort: 'asc',
        apikey: apiKey
    });

    // Função para buscar transações
    const fetchTransactions = async (startBlock) => {
        params.set('startblock', startBlock);
        const url = `https://api.etherscan.io/v2/api?${params.toString()}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data.result || !Array.isArray(data.result)) {
            throw new Error("Erro ao obter transações.");
        }

        return data.result;
    };

    let allTransactions = [];
    let lastBlock = 0;

    // Primeira consulta das transações
    let transactions = await fetchTransactions(0);
    allTransactions.push(...transactions);

    // Loop para buscar mais transações caso o limite de 10.000 seja alcançado
    while (transactions.length === 10000) {
        lastBlock = parseInt(transactions[transactions.length - 1].blockNumber);
        transactions = await fetchTransactions(lastBlock + 1);
        allTransactions.push(...transactions);
    }

    // ======================================================
    // 🔥 NOVO: BUSCA DO GAS DO PROTOCOLO VIA LOGS (POL 0x1010)
    // ======================================================

    const POL_CONTRACT = "0x0000000000000000000000000000000000001010";
    const LOG_TRANSFER_TOPIC =
        "0xe6497e3ee548a3372136af2fcb0696db31fc6cf20260707645068bd3fe97f3c4";

    const POL_LOG_ABI = [
        "event LogTransfer(address indexed token,address indexed from,address indexed to,uint256 amount,uint256 input1,uint256 input2,uint256 output1,uint256 output2)"
    ];

    const polIface = new ethers.Interface(POL_LOG_ABI);

    // --- Extrai blocos únicos das transações ---
    const blocks = [...new Set(allTransactions.map(tx => Number(tx.blockNumber)))].sort((a, b) => a - b);

    // Agora vamos aplicar a mesma lógica de paginação por 10.000 registros (sem janelas fixas) para os logs
    const logParamsBase = new URLSearchParams({
        chainid: '137',
        module: 'logs',
        action: 'getLogs',
        address: POL_CONTRACT,
        topic0: LOG_TRANSFER_TOPIC,
        apikey: apiKey
    });

    const fetchLogs = async (startBlock) => {
        logParamsBase.set('fromBlock', startBlock);

        const url = `https://api.etherscan.io/v2/api?${logParamsBase.toString()}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data.result || !Array.isArray(data.result)) {
            throw new Error("Erro ao obter logs.");
        }

        return data.result;
    };

    let allLogs = [];
    let lastBlocklog = 0;

    // Primeira consulta (EXATAMENTE igual)
    let logs = await fetchLogs(0);
    allLogs.push(...logs);

    // Loop de paginação (EXATAMENTE igual)
    while (logs.length === 1000) { // 👈 único ajuste: limite do endpoint
        lastBlocklog = parseInt(logs[logs.length - 1].blockNumber, 16);
        const nextStartBlock = lastBlocklog + 1;

        logs = await fetchLogs(nextStartBlock);
        allLogs.push(...logs);
    }

    const logsByTx = {};

    for (const log of allLogs) {
        // decode manual do amount (POL 0x1010)
        const dataHex = log.data.slice(2);
        const amountWei = BigInt("0x" + dataHex.slice(0, 64));

        const txHash = log.transactionHash.toLowerCase();

        if (!logsByTx[txHash]) logsByTx[txHash] = [];

        logsByTx[txHash].push({
            logtxHash: txHash,
            amountWei
        });
    }


    // ======================================================
    // ⛽ PROCESSAMENTO (MANTIDA LÓGICA ORIGINAL)
    // ======================================================

    const resumoPorDia = {};
    let decimal = 6;

    for (const tx of allTransactions) {
        const tipo = identificarTipoOperacaoPorNome(tx.functionName);
        if (tipo === 'Desconhecido') continue;

        decimal = Number(tx.tokenDecimal) || 6;
        const dataChave = formatarDataSimples(tx.timeStamp);
        const isSaida = tx.from.toLowerCase() === signerAddress.toLowerCase();
        const valor = parseFloat(ethers.formatUnits(tx.value, decimal)) * (isSaida ? -1 : 1);

        // ======================================================
        // ✅ NOVO: GAS DO PROTOCOLO (POL VIA LogTransfer)
        // ======================================================
        const txLogs = logsByTx[tx.hash.toLowerCase()] || [];
        const protocolGasWei = txLogs.reduce(
            (sum, l) => sum + l.amountWei, 0n
        );

        if (protocolGasWei > 0n) {
            console.log(txLogs);
            console.log("Gas (wei):", protocolGasWei.toString());
            console.log("Gas (POL):", ethers.formatUnits(protocolGasWei, 18));
        }


        const gas = parseFloat(ethers.formatUnits(protocolGasWei, 18)) || 0;

        if (!resumoPorDia[dataChave]) {
            resumoPorDia[dataChave] = {
                LiquidityAdd: 0,
                LiquidityRemove: 0,
                OpenPosition: 0,
                opCount: 0,
                lucroBruto: 0,
                perdaBruta: 0,
                gas: 0
            };
        }

        resumoPorDia[dataChave][tipo] += valor;
        resumoPorDia[dataChave].gas += gas;

        if (tipo === 'OpenPosition') {
            resumoPorDia[dataChave].opCount += 1;
            if (valor >= 0) resumoPorDia[dataChave].lucroBruto += valor;
            else resumoPorDia[dataChave].perdaBruta += Math.abs(valor);
        }
    }

    const datas = Object.keys(resumoPorDia).sort((a, b) => {
        const [d1, m1, y1] = a.split('/').map(Number);
        const [d2, m2, y2] = b.split('/').map(Number);
        return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
    });

    let capital = 0;
    let capitaldia1 = 0;
    let lucroTotal = 0;
    let gastotal = 0;

    const resultado = [];

    if (datas.length > 0) {
        const primeiraData = datas[0];
        const d0 = resumoPorDia[primeiraData];
        if (d0.LiquidityAdd > 0) capitaldia1 = d0.LiquidityAdd;
    }

    for (const dataKey of datas) {
        const d = resumoPorDia[dataKey];
        const investimento = d.LiquidityAdd + d.LiquidityRemove;
        const lucro = d.OpenPosition;
        const capitalInicialDia = capital > 0 ? capital : capitaldia1;
        capital += investimento + lucro;
        lucroTotal += lucro;
        gastotal += d.gas;

        const transacoesDoDia = allTransactions.filter(tx => {
            return formatarDataSimples(tx.timeStamp) === dataKey;
        });

        const percentualPonderado = calculaPPT(transacoesDoDia, capitalInicialDia, signerAddress, decimal);

        resultado.push({
            data: dataKey,
            addRem: investimento,
            capital,
            lucroDia: lucro,
            lucroTotal,
            percentual: percentualPonderado,
            operacoes: d.opCount,
            lucroBruto: d.lucroBruto,
            perdaBruta: d.perdaBruta,
            gasDia: d.gas,        // 👈 adiciona gas diário
            gasTotal: gastotal,    // 👈 adiciona gas acumulado
            decimal
        });
    }

    // --- cálculo das últimas 24h ---
    const agora = Math.floor(Date.now() / 1000); // Timestamp atual
    const limite24h = agora - 24 * 60 * 60;  // Timestamp de 24 horas atrás

    const ultimas24hOps = allTransactions.filter(op => {
        const tipo = identificarTipoOperacaoPorNome(op.functionName);
        return tipo === "OpenPosition" && Number(op.timeStamp) >= limite24h;
    });

    // 💰 lucro/perda das últimas 24h
    const ultimas24hValores = ultimas24hOps.map(op => {
        const valor = parseFloat(ethers.formatUnits(op.value, decimal)) *
            (op.from.toLowerCase() === signerAddress.toLowerCase() ? -1 : 1);
        return valor;
    });

    // ⛽ cálculo do gas das últimas 24h
    const gas24hTotal = ultimas24hOps.reduce((acc, op) => {
        const gasUsed = BigInt(op.gasUsed || 0n);
        const gasPrice = BigInt(op.gasPrice || 0n);
        const totalWei = gasUsed * gasPrice;
        const gasEther = parseFloat(ethers.formatEther(totalWei)) || 0;
        return acc + gasEther;
    }, 0);

    // 📈 estatísticas de lucro
    const lucro24hValor = ultimas24hValores.reduce((acc, v) => acc + v, 0);
    const totalOperacoes24h = ultimas24hValores.length;
    const totalLucroBruto24h = ultimas24hValores.filter(v => v >= 0).reduce((acc, v) => acc + v, 0);
    const totalPerdaBruta24h = ultimas24hValores.filter(v => v < 0).reduce((acc, v) => acc + Math.abs(v), 0);

    // 🔹 ROI das últimas 24h
    let capitalAntes24h = 0;
    for (let i = resultado.length - 1; i >= 0; i--) {
        const dataItem = new Date(resultado[i].data.split('/').reverse().join('-'));
        if (dataItem.getTime() / 1000 < limite24h) {
            capitalAntes24h = resultado[i].capital;
            break;
        }
    }
    if (capitalAntes24h === 0 && resultado.length > 0) {
        capitalAntes24h = resultado[resultado.length - 1].capital;
    }
    const lucro24hPercent = capitalAntes24h > 0 ? (lucro24hValor / capitalAntes24h) * 100 : 0;

    // 🧾 objeto final das últimas 24h
    const lucro24h = {
        valor: lucro24hValor,
        percentual: lucro24hPercent,
        totalOperacoes: totalOperacoes24h,
        totalLucroBruto: totalLucroBruto24h,
        totalPerdaBruta: totalPerdaBruta24h,
        gasTotal: gas24hTotal,   // 👈 novo campo: total de gas nas últimas 24h
        decimal
    };

    return { resultado, lucro24h };  // Retorna o resultado e os dados das últimas 24h
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