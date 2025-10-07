require("dotenv").config();
const axios = require('axios');
const ethers = require('ethers');

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

            return {
                transactionHash: tx.hash,
                method,
                block: tx.blockNumber,
                amount,
                functionName,
                timestamp: parseInt(tx.timeStamp),
                index,
                methodId
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


module.exports = {
    getTokenTransactions,
};
