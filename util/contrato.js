require("dotenv").config();
const axios = require('axios');
const ethers = require('ethers');
const provider_decode = new ethers.JsonRpcProvider(process.env.RPC_GLOBAL);

async function getTokenTransactions(walletAddress, tokenContractAddress, apiKey) {
    if (!apiKey) {
        console.error("Erro: Chave de API do Etherscan V2 não configurada. Verifique seu arquivo .env.");
        return [];
    }

    const BASE_API_URL_V2 = "https://api.etherscan.io/v2/api";
    const POLYGON_CHAIN_ID = 137;

    const params = {
        chainid: POLYGON_CHAIN_ID,
        module: 'account',
        action: 'tokentx',
        address: walletAddress,
        contractaddress: tokenContractAddress,
        sort: 'desc',
        apikey: apiKey
    };

    const apiUrl = `${BASE_API_URL_V2}?${new URLSearchParams(params).toString()}`;

    try {
        const response = await axios.get(apiUrl);

        const status = response.data.status;
        const message = response.data.message;
        const transactions = response.data.result;

        if (status === "0") {
            console.error(`Erro da API Etherscan: ${message}`);
            return [];
        }

        if (!Array.isArray(transactions) || transactions.length === 0) {
            console.log("Nenhuma transação encontrada ou formato inesperado.");
            return [];
        }

        const tokenSymbol = "LPUSDT";

        const formattedTransactions = await Promise.all(transactions.map(async (tx) => {
            const from = tx.from.toLowerCase();
            const to = tx.to.toLowerCase();
            const wallet = walletAddress.toLowerCase();

            const isOutgoing = from === wallet;
            const isBurn = to === "0x0000000000000000000000000000000000000000";

            // Valor formatado com sinal negativo se for saída
            const rawAmount = ethers.formatUnits(tx.value, 6);
            const amount = `${isOutgoing ? '-' : ''}${rawAmount} ${tokenSymbol}`;

            // Determinar método
            let method = "Transfer";
            if (isBurn) {
                method = "Burn";
            } else if (isOutgoing) {
                method = "Transfer Out";
            } else if (to === wallet) {
                method = "Transfer In";
            }

            // Nome da função simplificado
            let functionName = tx.functionName || "N/A";
            const match = functionName.match(/^([a-zA-Z0-9_]+)\(/);
            if (match && match[1]) {
                functionName = match[1];
            }

            const index = tx.transactionIndex;
            const methodId = tx.methodId;

            const gasUsed = BigInt(tx.gasUsed);
            const gasPrice = BigInt(tx.gasPrice);
            const totalWei = gasUsed * gasPrice;
            const gasValor = Number(ethers.formatEther(totalWei)).toFixed(5);

            return {
                transactionHash: tx.hash,
                method,
                block: tx.blockNumber,
                amount,
                functionName,
                timestamp: parseInt(tx.timeStamp),
                index,
                methodId,
                gasValor
            };
        }));

        return formattedTransactions;

    } catch (error) {
        console.error("Erro ao buscar transações (Axios ou rede):", error.message);
        if (error.response) {
            console.error("Dados do erro da API:", error.response.data);
        }
        return [];
    }
}


const ABI_DECODE_TX = [
  "function LiquidityAdd(string[] accountId,address strategyToken,address coin,uint256 amount)",
  "function LiquidityAdd(string accountId,address strategyToken,address coin,uint256 amount)", // fallback possível
  "function LiquidityRemove(string[] accountId,address strategyToken,address coin,uint256 amount)",
  "function LiquidityRemove(string accountId,address strategyToken,address coin,uint256 amount)", // fallback
  "function openPosition(address contractAddress,string accountId,address strategyToken,address user,int256 amount,(address,address)[] pairs,uint256 leverage,address referrer)",
  "function openPosition(address, string, address, address, int256, (address,address)[], uint256, address, string)"
];


// Função que busca e decodifica input data
async function decodeTransactionInput(txHash, provider1) {
    console.log("⚙️ Executando decodeTransactionInput");

    try {
        const tx = await provider_decode.getTransaction(txHash);

        if (!tx) throw new Error(`Transação ${txHash} não encontrada`);

        const iface = new ethers.Interface(ABI_DECODE_TX);
        const decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
        if (!decoded) throw new Error("Método não encontrado na ABI");

        if (decoded.name === "LiquidityAdd" || decoded.name === "LiquidityRemove") {
            const rawAccount = decoded.args[0];
            const accountIdArray = Array.isArray(rawAccount) ? rawAccount : [rawAccount];

            return {
                functionName: decoded.name,
                args: {
                    accountId: accountIdArray,
                    strategyToken: decoded.args[1],
                    coin: decoded.args[2],
                    amount: decoded.args[3]?.toString?.() || null,
                },
            };
        }

        if (decoded.name === "openPosition") {
            const rawAccount = decoded.args[1];
            const accountIdArray = Array.isArray(rawAccount) ? rawAccount : [rawAccount];

            return {
                functionName: decoded.name,
                args: {
                    contractAddress: decoded.args[0],
                    accountId: accountIdArray,
                    strategyToken: decoded.args[2],
                    user: decoded.args[3],
                    amount: decoded.args[4]?.toString?.() || null,
                    pairs: decoded.args[5],
                    leverage: decoded.args[6]?.toString?.() || null,
                    referrer: decoded.args[7],
                },
            };
        }

        return {
            functionName: decoded.name,
            args: decoded.args,
        };
    } catch (error) {
        const methodId = ""; //(tx?.data || "").slice(0, 10);
        console.warn(`Erro ao decodificar input: ${txHash} ${error.message} (${methodId} )`);
        return { functionName: "unknown", args: {}, methodId };
    }
}


module.exports = {
    getTokenTransactions,
    decodeTransactionInput
};
