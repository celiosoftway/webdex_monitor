require("dotenv").config();
const axios = require('axios');
const ethers = require('ethers');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');

const RPC_GLOBAL = process.env.RPC_GLOBAL;
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY;
const provider = new ethers.JsonRpcProvider(RPC_GLOBAL);
const TOKEN_COLATERAL_ADDRESS = process.env.TOKEN_COLATERAL_ADDRESS
const FILE_PATH = path.resolve('./unique_holders_24h.json');

const { decodeTransactionInput } = require("./contrato");

// Blocos por hora na Polygon ≈ 1714 (2.1s médio)
const BLOCKS_24H = 1714 * 12;

const ABI_DECODE_TX = [
    "function LiquidityAdd(string[] accountId,address strategyToken,address coin,uint256 amount)",
    "function LiquidityAdd(string accountId,address strategyToken,address coin,uint256 amount)", // fallback possível
    "function LiquidityRemove(string[] accountId,address strategyToken,address coin,uint256 amount)",
    "function LiquidityRemove(string accountId,address strategyToken,address coin,uint256 amount)", // fallback
    "function openPosition(address contractAddress,string accountId,address strategyToken,address user,int256 amount,(address,address)[] pairs,uint256 leverage,address referrer)",
    "function openPosition(address, string, address, address, int256, (address,address)[], uint256, address, string)"
];

/**
 * Função principal – agora com:
 * 1. Bloco inicial calculado dinamicamente (-24h)
 * 2. Salvamento automático em JSON (pra seu cron diário)
 * 3. Retorna o número de contas únicas pra usar na estimativa de tempo
 */
async function getUniqueHoldersLast24h() {
    try {
        // 1. Pegar bloco atual e calcular o inicial (-24h)
        const endBlock = await provider.getBlockNumber();
        const startBlock = endBlock - BLOCKS_24H;

        console.log(`🟢 Monitorando últimas ~24h`);
        console.log(`   Bloco atual: ${endBlock}`);
        console.log(`   Bloco inicial (≈24h atrás): ${startBlock}`);

        const params = new URLSearchParams({
            chainid: '137',
            module: 'account',
            action: 'tokentx',
            contractaddress: TOKEN_COLATERAL_ADDRESS,
            sort: 'asc',
            apikey: POLYGONSCAN_API_KEY,
            startblock: startBlock,
            endblock: endBlock
        });

        const url = `https://api.etherscan.io/v2/api?${params.toString()}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data.status !== "1" || !Array.isArray(data.result)) {
            throw new Error(`Polygonscan error: ${data.message || data.result}`);
        }

        const txs = data.result;
        console.log(`📡 ${txs.length} transações encontradas nas últimas 24h`);

        const uniqueAccounts = new Set();
        let decodedCount = 0;

        const delay = (ms) => new Promise(res => setTimeout(res, ms));

        for (const tx of txs) {
            try {
                const txHash = tx.hash;
                const decoded = await decodeTransactionInput(txHash, provider);
                const accountId = decoded?.args?.accountId?.[0];

                if (accountId && accountId !== 'unknown') {
                    uniqueAccounts.add(accountId.toLowerCase()); // evita case-sensitive
                    decodedCount++;
                }

                // Log a cada 50 txs pra você sentir o cyber-pulse
                if (decodedCount % 50 === 0 && decodedCount > 0) {
                    console.log(`⚡ Decodificados: ${decodedCount} | Contas únicas até agora: ${uniqueAccounts.size}`);
                }

                await delay(180); // respeitando rate limit (~5 req/s)
            } catch (err) {
                // uma tx falhar não mata o batch todo
                continue;
            }
        }

        const result = {
            timestamp: new Date().toISOString(),
            startBlock,
            endBlock,
            totalTransactions: txs.length,
            successfullyDecoded: decodedCount,
            uniqueHolders: uniqueAccounts.size,
            holdersList: Array.from(uniqueAccounts), // opcional: salva a lista completa
        };

        // 2. Salva em JSON lindo pra seu cron diário
        await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
        await fs.writeFile(FILE_PATH, JSON.stringify(result, null, 2));
        console.log(`💾 Dados salvos em ${FILE_PATH}`);
        console.log(`🎉 Holders únicos nas últimas 24h: ${result.uniqueHolders}`);

        return result.uniqueHolders; // ← valor que você vai usar na estimativa!

    } catch (error) {
        console.error("💥 Erro crítico em getUniqueHoldersLast24h:", error.message);
        return 0;
    }
}

function formatHours(decimalHours) {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);

    if (hours === 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} h`;

    return `${hours} h ${minutes} min`;
}

async function getProtocolSpeed(totalAccounts) {
    const endBlock = await provider.getBlockNumber();
    const startBlock = endBlock - 500;

    const params = new URLSearchParams({
        chainid: '137',
        module: 'account',
        action: 'tokentx',
        contractaddress: TOKEN_COLATERAL_ADDRESS,
        sort: 'asc',
        apikey: POLYGONSCAN_API_KEY,
        startblock: startBlock,
        endblock: endBlock
    });

    const url = `https://api.etherscan.io/v2/api?${params.toString()}`;
    const response = await axios.get(url);
    const data = response.data;

    if (!data.result || !Array.isArray(data.result)) {
        throw new Error("Erro ao obter transações.");
    }

    const txList = data.result || [];

    if (txList.length === 0) {
        return {
            txPerMinute: 0,
            cycleMinutes: Infinity,
            cycleHours: Infinity,
            activeTx: 0
        };
    }

    // ✅ FILTRO BARATO POR FUNÇÃO
    const openPositions = txList.filter(tx => {
        const tipo = identificarTipoOperacaoPorNome(tx.functionName);
        return tipo === 'OpenPosition';
    });

    const activeTx = openPositions.length;

    if (activeTx === 0) {
        return {
            startBlock,
            endBlock,
            minutesInterval: 0,
            activeTx: 0,
            txPerMinute: 0,
            cycleMinutes: Infinity,
            cycleHours: Infinity
        };
    }

    const blockStart = await provider.getBlock(startBlock);
    const blockEnd = await provider.getBlock(endBlock);

    const minutes = (blockEnd.timestamp - blockStart.timestamp) / 60;
    const txPerMinute = activeTx / minutes;

    const cycleMinutes = totalAccounts / txPerMinute;
    const cycleHours = cycleMinutes / 60;

    return {
        startBlock,
        endBlock,
        minutesInterval: Number(minutes.toFixed(2)),
        activeTx,
        txPerMinute: Number(txPerMinute.toFixed(4)),
        cycleMinutes: Number(cycleMinutes.toFixed(2)),
        cycleHours: Number(cycleHours.toFixed(2))
    };
}

function identificarTipoOperacaoPorNome(functionName = '') {
  const name = functionName.toLowerCase();

  if (name.includes('liquidityadd')) return 'LiquidityAdd';
  if (name.includes('liquidityremove')) return 'LiquidityRemove';
  if (name.includes('openposition')) return 'OpenPosition';

  return 'Desconhecido';
}


async function formatProtocolSpeed(result, totalAccounts) {
    return `
📊 *Atividade do Protocolo (últimos 100 blocos)*

⛓️ *Blocos analisados:*
• ${result.startBlock} → ${result.endBlock}

⏱️ *Tempo real analisado:* 
• ${result.minutesInterval.toFixed(2)} minutos

🔁 *Transações:*
• ${result.activeTx} transações no período
• ${result.txPerMinute.toFixed(2)} tx/min

👥 *Contas no ciclo:*
• ${totalAccounts} contas

⏳ *Tempo estimado para um ciclo completo:*
• ${result.cycleMinutes.toFixed(0)} minutos
• ${formatHours(result.cycleHours)}
`.trim();
}

function iniciarTotalContas() {
    console.log("🔄 Iniciando contagem de contas...");

    cron.schedule(
        '00 08 * * *',
        async () => {
            console.log(`[${new Date().toLocaleString('pt-BR')}] Disparando cron...`);
            try {
                getUniqueHoldersLast24h();
            } catch (err) {
                console.error(err);
            }
        },
        { timezone: 'America/Sao_Paulo' }
    );

    console.log('🕒 Cron agendado.');
}


(async () => {
    /*
    const data = await fs.readFile(FILE_PATH, 'utf-8');
    const json = JSON.parse(data);

    // 1) obter número total de contas
    const total = json.uniqueHolders || 1864;

    // 2) medir velocidade do protocolo
    const speed = await getProtocolSpeed(total);
    const formata = await formatProtocolSpeed(speed, total)

    // console.log("Total contas:", total);
    console.log(formata);
    */
})();

module.exports = {
    iniciarTotalContas,
    getUniqueHoldersLast24h,
    getProtocolSpeed,
    formatProtocolSpeed,
}