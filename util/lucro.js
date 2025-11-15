require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const { getCMCPrice } = require('./util');

const {
  formatarDataSimples,
  identificarTipoOperacaoPorNome } = require("./util");

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

  const url = `https://api.etherscan.io/v2/api?${params.toString()}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!data.result || !Array.isArray(data.result)) {
    throw new Error("Erro ao obter transações.");
  }

  const resumoPorDia = {};

  for (const tx of data.result) {
    const tipo = identificarTipoOperacaoPorNome(tx.functionName);
    if (tipo === 'Desconhecido') continue;

    const dataChave = formatarDataSimples(tx.timeStamp);
    const isSaida = tx.from.toLowerCase() === signerAddress.toLowerCase();
    const valor = parseFloat(ethers.formatUnits(tx.value, 6)) * (isSaida ? -1 : 1);

    // --- cálculo do gas ---
    const gasUsed = BigInt(tx.gasUsed || 0n);
    const gasPrice = BigInt(tx.gasPrice || 0n);
    const totalWei = gasUsed * gasPrice;
    const gas = parseFloat(ethers.formatEther(totalWei)) || 0;

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

    const transacoesDoDia = data.result.filter(tx => {
      return formatarDataSimples(tx.timeStamp) === dataKey;
    });

    const percentualPonderado = calculaPPT(transacoesDoDia, capitalInicialDia, signerAddress);

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
      gasTotal: gastotal    // 👈 adiciona gas acumulado
    });
  }

  // --- cálculo das últimas 24h ---
  // ---- Lucro e gas das últimas 24h ----
  const agora = Math.floor(Date.now() / 1000);
  const limite24h = agora - 24 * 60 * 60;

  const ultimas24hOps = data.result.filter(op => {
    const tipo = identificarTipoOperacaoPorNome(op.functionName);
    return tipo === "OpenPosition" && Number(op.timeStamp) >= limite24h;
  });

  // 💰 lucro/perda das últimas 24h
  const ultimas24hValores = ultimas24hOps.map(op => {
    const valor = parseFloat(ethers.formatUnits(op.value, 6)) *
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
    gasTotal: gas24hTotal   // 👈 novo campo: total de gas nas últimas 24h
  };

  return { resultado, lucro24h };
}


function getResumoPeriodo(dados, dias = 7, incluirHoje = false) {
  const ordenarPorData = (a, b) => {
    const [d1, m1, y1] = a.data.split('/').map(Number);
    const [d2, m2, y2] = b.data.split('/').map(Number);
    return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
  };

  const todos = [...dados].sort(ordenarPorData);

  const hoje = new Date();
  const hojeBase = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  let inicio, fim;

  if (dias === 0) {
    // 🔹 apenas dia atual
    inicio = hojeBase;
    fim = hoje;
  } else {
    // 🔹 períodos fechados
    fim = new Date(hojeBase);
    if (!incluirHoje) fim.setDate(fim.getDate() - 1); // termina ontem se não incluir hoje
    inicio = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() - (dias - 1));
  }

  const filtrados = todos.filter(item => {
    const [dia, mes, ano] = item.data.split('/').map(Number);
    const dataItem = new Date(ano, mes - 1, dia);
    return dataItem >= inicio && dataItem <= fim;
  });

  //if (filtrados.length === 0) return null;

  if (filtrados.length === 0) {
    return {
      periodo:
        dias === 0
          ? "Dia atual"
          : incluirHoje
            ? `Últimos ${dias} dias (inclui hoje)`
            : `Últimos ${dias} dias fechados`,
      addRem: 0,
      lucroDia: 0,
      lucroTotal: 0,
      capitalInicial: 0,
      capitalFinal: 0,
      percentual: 0,

      // 🔥 Estes campos estavam faltando e estavam quebrando o handler
      totalOperacoes: 0,
      totalLucroBruto: 0,
      totalPerdaBruta: 0,
      gasPeriodo: 0,           // <—— ESSENCIAL
    };
  }


  // agregados do período
  const addRem = filtrados.reduce((acc, x) => acc + x.addRem, 0);
  const lucroDia = filtrados.reduce((acc, x) => acc + x.lucroDia, 0);

  // ✅ Novo cálculo: percentual composto (mantém ponderação diária e efeito acumulado)
  // const somaPercentuais = filtrados.reduce((acc, x) => acc + x.percentual, 0);
  const percentual = (filtrados.reduce((acc, x) => acc * (1 + (x.percentual || 0) / 100), 1) - 1) * 100;

  const totalOperacoes = filtrados.reduce((acc, x) => acc + (x.operacoes || 0), 0);
  const totalLucroBruto = filtrados.reduce((acc, x) => acc + (x.lucroBruto || 0), 0);
  const totalPerdaBruta = filtrados.reduce((acc, x) => acc + (x.perdaBruta || 0), 0);

  const primeiroDia = filtrados[0];
  const ultimoDia = filtrados[filtrados.length - 1];

  const idxPrimeiro = todos.findIndex(x => x.data === primeiroDia.data);
  const lucroAcumuladoAntes = idxPrimeiro > 0 ? todos[idxPrimeiro - 1].lucroTotal : 0;
  const lucroTotalPeriodo = ultimoDia.lucroTotal - lucroAcumuladoAntes;

  const capitalInicial = primeiroDia.capital;
  const capitalFinal = ultimoDia.capital;

  const gasPeriodo = filtrados.reduce((acc, x) => acc + (x.gasDia || 0), 0);


  return {
    periodo:
      dias === 0
        ? "Dia atual"
        : incluirHoje
          ? `Últimos ${dias} dias (inclui hoje)`
          : `Últimos ${dias} dias fechados`,
    addRem,
    lucroDia,
    lucroTotal: lucroTotalPeriodo,
    capitalInicial,
    capitalFinal,
    //percentual: somaPercentuais,
    percentual,
    totalOperacoes,
    totalLucroBruto,
    totalPerdaBruta,
    gasPeriodo
  };
}

// calcula porcentagem ponderada por tempo
function calculaPPT(transacoesDia = [], capitalInicialDia = 0, carteira) {
  const signerAddress = carteira;
  const tokenDecimals = 6;

  if (!Array.isArray(transacoesDia) || transacoesDia.length === 0) {
    return { percentual: 0, capitalMedio: Number(capitalInicialDia || 0), lucroDia: 0 };
  }

  // garantir ordenação por timestamp (em segundos)
  const txs = [...transacoesDia].sort((a, b) => Number(a.timeStamp) - Number(b.timeStamp));

  // início do dia (em segundos) baseado no timestamp do primeiro tx
  const firstTsMs = new Date(Number(txs[0].timeStamp) * 1000).setHours(0, 0, 0, 0);
  const dayStartSec = Math.floor(firstTsMs / 1000);
  const dayEndSec = dayStartSec + 24 * 3600;

  let capital = Number(capitalInicialDia || 0);
  let somaPonderada = 0; // capital * segundos
  let tempoTotal = 0;    // em segundos
  let ultimoTs = dayStartSec; // começa no início do dia

  const valorTx = (tx) => {
    // converte para unidades humanas (ex: USDT com 6 decimais)
    let v = 0;
    try {
      v = Number(ethers.formatUnits(tx.value, tokenDecimals));
    } catch (e) {
      // fallback if needed
      v = Number(tx.value) || 0;
    }
    const isSaida = tx.from && tx.from.toLowerCase() === signerAddress.toLowerCase();
    return isSaida ? -v : v;
  };

  for (const tx of txs) {
    const ts = Number(tx.timeStamp); // segundos
    const delta = Math.max(0, ts - ultimoTs);
    if (delta > 0) {
      somaPonderada += capital * delta;
      tempoTotal += delta;
    }

    // aplica mudança de capital usando o valor convertido (com sinal)
    const tipo = identificarTipoOperacaoPorNome(tx.functionName);
    const v = valorTx(tx); // já com sinal

    if (tipo === "LiquidityAdd" || tipo === "LiquidityRemove" || tipo === "OpenPosition") {
      capital += v;
    } else {
      // outros tipos: ignorar ou tratar conforme necessário
    }

    ultimoTs = ts;
  }

  // do último evento até o fim do dia
  const deltaFinal = Math.max(0, dayEndSec - ultimoTs);
  if (deltaFinal > 0) {
    somaPonderada += capital * deltaFinal;
    tempoTotal += deltaFinal;
  }

  const capitalMedio = tempoTotal > 0 ? (somaPonderada / tempoTotal) : Number(capitalInicialDia || 0);

  // lucro do dia: soma de openPosition (com sinal convertido)
  const lucroDia = txs
    .filter(tx => identificarTipoOperacaoPorNome(tx.functionName) === "OpenPosition")
    .reduce((acc, tx) => acc + valorTx(tx), 0);

  const percentual = capitalMedio > 0 ? (lucroDia / capitalMedio) * 100 : 0;

  //return { percentual, capitalMedio, lucroDia };
  return percentual;
}

async function historico(carteira, api, token) {
  try {
    const signerAddress = carteira;
    const apiKey = api;
    const colateral = token;

    // --- preço do POL em USD ---
    const polPrice = await getCMCPrice("POL"); // retorna number

    const params = new URLSearchParams({
      chainid: '137',
      module: 'account',
      action: 'tokentx',
      address: signerAddress,
      contractaddress: colateral,
      sort: 'asc',
      apikey: apiKey
    });

    const url = `https://api.etherscan.io/v2/api?${params.toString()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.result || !Array.isArray(data.result)) {
      return ctx.reply('Erro ao obter transações.');
    }

    const resumoPorDia = {};

    // --------------------------
    // PROCESSAR TRANSAÇÕES
    // --------------------------
    for (const tx of data.result) {
      const tipo = identificarTipoOperacaoPorNome(tx.functionName);
      if (tipo === 'Desconhecido') continue;

      const dataChave = formatarDataSimples(tx.timeStamp);
      const isSaida = tx.from.toLowerCase() === signerAddress.toLowerCase();
      const valor = parseFloat(ethers.formatUnits(tx.value, 6)) * (isSaida ? -1 : 1);

      // inicializar dia
      if (!resumoPorDia[dataChave]) {
        resumoPorDia[dataChave] = {
          LiquidityAdd: 0,
          LiquidityRemove: 0,
          OpenPosition: 0,
          gasPOL: 0,
          gasUSD: 0
        };
      }

      resumoPorDia[dataChave][tipo] += valor;

      // ---- cálculo do gas por transação ----
      const gasUsed = BigInt(tx.gasUsed);
      const gasPrice = BigInt(tx.gasPrice);
      const totalWei = gasUsed * gasPrice;
      const gasPOL = parseFloat(ethers.formatEther(totalWei)) || 0;

      console.log(`\n gaspol: ${gasPOL}`)

      const gasUSD = gasPOL * polPrice;

      resumoPorDia[dataChave].gasPOL += Number(gasPOL);
      resumoPorDia[dataChave].gasUSD += gasUSD;

      console.log(`\n resumoPorDia[dataChave].gasPOL: ${resumoPorDia[dataChave].gasPOL}`)
    }

    // --------------------------
    // GERAR CSV
    // --------------------------

    const csv = [
      'Data;Add/Rem;Capital;Lucro Dia;Lucro Total;Gas POL;Gas USD;Liquido Dia;Total Liquido;Per % Liquido'
    ];

    const datas = Object.keys(resumoPorDia).sort((a, b) => {
      const [d1, m1, y1] = a.split('/').map(Number);
      const [d2, m2, y2] = b.split('/').map(Number);
      return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
    });

    let capital = 0;
    let lucroTotal = 0;
    let gasTotalUSD = 0;
    let capitaldia1 = 0;

    // Definir capital inicial pela primeira liquidez adicionada
    if (datas.length > 0) {
      const d0 = resumoPorDia[datas[0]];
      if (d0.LiquidityAdd > 0) capitaldia1 = d0.LiquidityAdd;
    }

    for (const dataKey of datas) {
      const d = resumoPorDia[dataKey];

      const investimento = d.LiquidityAdd + d.LiquidityRemove;
      const lucro = d.OpenPosition;

      const capitalInicialDia = capital > 0 ? capital : capitaldia1;

      capital += investimento + lucro;
      lucroTotal += lucro;

      // gas acumulado
      gasTotalUSD += d.gasUSD;

      // --- liquido ---
      const lucroLiquidoDia = lucro - d.gasUSD;
      const lucroTotalLiquido = lucroTotal - gasTotalUSD;

      // --- porcentagem líquida ---
      const percentualLiquido = capitalInicialDia > 0
        ? (lucroLiquidoDia / capitalInicialDia) * 100
        : 0;

      console.log(`d.gasPOL ${d.gasPOL}`)

      csv.push(
        `${dataKey};` +
        `${investimento.toFixed(2).replace('.', ',')};` +
        `${capital.toFixed(2).replace('.', ',')};` +
        `${lucro.toFixed(2).replace('.', ',')};` +
        `${lucroTotal.toFixed(2).replace('.', ',')};` +
        `${d.gasPOL.toFixed(3)};` +
        `${d.gasUSD.toFixed(2).replace('.', ',')};` +
        `${lucroLiquidoDia.toFixed(2).replace('.', ',')};` +
        `${lucroTotalLiquido.toFixed(2).replace('.', ',')};` +
        `${percentualLiquido.toFixed(2).replace('.', ',')}%`
      );
    }

    // console.log(csv);
    return csv;

  } catch (err) {
    console.error("Erro ao exibir histórico:", err);
  }
}


module.exports = {
  getResumoPeriodo,
  getHistoricoDados,
  historico
}