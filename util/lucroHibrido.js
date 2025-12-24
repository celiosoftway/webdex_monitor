const { Op } = require('sequelize');
const { ethers } = require('ethers');
const { Transaction } = require('../db/bi');

const {
  formatarDataSimples,
  identificarTipoOperacaoPorNome,
  getCMCPrice } = require("./util");

const { calculaPPT, decodeTransactionInputUser } = require('./lucro'); 

// ===============================
// FUNÇÃO PRINCIPAL (HÍBRIDA)
// ===============================
async function getHistoricoDadosLiquidoHibrido(
  carteira,
  api,
  token,
  rpc
) {
  const signerAddress = carteira.toLowerCase();
  const apiKey = api;
  const colateral = token;

  // ======================================================
  // 1️⃣ BUSCA HISTÓRICO NO BANCO
  // ======================================================
  const dbTxs = await Transaction.findAll({
    where: {
      carteira: signerAddress,
      decodeStatus: 'OK'
    },
    order: [['blockNumber', 'ASC']]
  });

  const ultimoBlocoIndexado =
    dbTxs.length > 0
      ? dbTxs[dbTxs.length - 1].blockNumber
      : 0;

  // ======================================================
  // 2️⃣ BUSCA TRANSAÇÕES RECENTES (API)
  // ======================================================
  const params = new URLSearchParams({
    chainid: '137',
    module: 'account',
    action: 'tokentx',
    address: signerAddress,
    contractaddress: colateral,
    sort: 'asc',
    startblock: ultimoBlocoIndexado + 1,
    apikey: apiKey
  });

  const url = `https://api.etherscan.io/v2/api?${params.toString()}`;
  const response = await fetch(url);
  const data = await response.json();

  const apiTxs = Array.isArray(data.result) ? data.result : [];

  // ======================================================
  // 3️⃣ NORMALIZA DB + API NO MESMO FORMATO
  // ======================================================
  const allTransactions = [
    ...dbTxs.map(tx => ({
      blockNumber: tx.blockNumber,
      timeStamp: tx.timeStamp,
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      tokenDecimal: tx.tokenDecimal,
      functionName: tx.functionName,
      gasUsed: tx.gasUsed,
      gasPrice: tx.gasPrice,
      gasCobrado: tx.gasCobrado,
      gasWebdex: tx.gasWebdex  //adicionado
    })),
    ...apiTxs
  ];

  // ======================================================
  // 4️⃣ LÓGICA ORIGINAL (SEM ALTERAÇÃO)
  // ======================================================
  const resumoPorDia = {};
  let decimal = 6;

  for (const tx of allTransactions) {
    const tipo = identificarTipoOperacaoPorNome(tx.functionName);
    if (tipo === 'Desconhecido') continue;

    decimal = Number(tx.tokenDecimal) || 6;
    const dataChave = formatarDataSimples(tx.timeStamp);

    const isSaida =
      tx.from.toLowerCase() === signerAddress;

    const valor =
      parseFloat(ethers.formatUnits(tx.value, decimal)) *
      (isSaida ? -1 : 1);

    let gas = 0;

    if (tipo === 'OpenPosition') {
      if (tx.gasWebdex) {
        gas = Number(tx.gasWebdex);
      } else {
        try {
          const decode = await decodeTransactionInputUser(
            tx.hash,
            rpc
          );
          gas = parseFloat(
            ethers.formatUnits(decode.args.gas, 18)
          ) || 0;
        } catch {
          gas = 0;
        }
      }
    }

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
      if (valor >= 0)
        resumoPorDia[dataChave].lucroBruto += valor;
      else
        resumoPorDia[dataChave].perdaBruta += Math.abs(valor);
    }
  }

  // ======================================================
  // 5️⃣ PARTE FINAL (IDÊNTICA AO ORIGINAL)
  // ======================================================
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
    if (d0.LiquidityAdd > 0)
      capitaldia1 = d0.LiquidityAdd;
  }

  for (const dataKey of datas) {
    const d = resumoPorDia[dataKey];
    const investimento = d.LiquidityAdd + d.LiquidityRemove;
    const lucro = d.OpenPosition;
    const capitalInicialDia =
      capital > 0 ? capital : capitaldia1;

    capital += investimento + lucro;
    lucroTotal += lucro;
    gastotal += d.gas;

    const percentualPonderado = calculaPPT(
      allTransactions.filter(
        tx => formatarDataSimples(tx.timeStamp) === dataKey
      ),
      capitalInicialDia,
      signerAddress,
      decimal
    );

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
      gasDia: d.gas,
      gasTotal: gastotal,
      decimal
    });
  }

  // ===== ÚLTIMAS 24H (SEM ALTERAÇÃO) =====
  const agora = Math.floor(Date.now() / 1000);
  const limite24h = agora - 86400;

  const ultimas24hOps = allTransactions.filter(tx =>
    identificarTipoOperacaoPorNome(tx.functionName) === 'OpenPosition' &&
    Number(tx.timeStamp) >= limite24h
  );

  const valores24h = ultimas24hOps.map(tx =>
    parseFloat(ethers.formatUnits(tx.value, decimal)) *
    (tx.from.toLowerCase() === signerAddress ? -1 : 1)
  );

  const lucro24hValor = valores24h.reduce((a, b) => a + b, 0);
  const totalOperacoes24h = valores24h.length;

  const lucro24h = {
    valor: lucro24hValor,
    percentual: capital > 0 ? (lucro24hValor / capital) * 100 : 0,
    totalOperacoes: totalOperacoes24h,
    totalLucroBruto: valores24h.filter(v => v >= 0).reduce((a, b) => a + b, 0),
    totalPerdaBruta: valores24h.filter(v => v < 0).reduce((a, b) => a + Math.abs(b), 0),
    gasTotal: gastotal,
    decimal
  };

  return { resultado, lucro24h };
}

module.exports = {
  getHistoricoDadosLiquidoHibrido
};