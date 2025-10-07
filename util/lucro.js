require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

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

  // --- agrega por DIA, já contando operações e separando ganhos/perdas (OpenPosition)
  const resumoPorDia = {};
  for (const tx of data.result) {
    const tipo = identificarTipoOperacaoPorNome(tx.functionName);
    if (tipo === 'Desconhecido') continue;

    const dataChave = formatarDataSimples(tx.timeStamp);
    const isSaida = tx.from.toLowerCase() === signerAddress.toLowerCase();
    const valor = parseFloat(ethers.formatUnits(tx.value, 6)) * (isSaida ? -1 : 1);

    if (!resumoPorDia[dataChave]) {
      resumoPorDia[dataChave] = {
        LiquidityAdd: 0,
        LiquidityRemove: 0,
        OpenPosition: 0,
        opCount: 0,          // nº de OpenPosition no dia
        lucroBruto: 0,       // soma de positivos (OpenPosition)
        perdaBruta: 0        // soma do módulo dos negativos (OpenPosition)
      };
    }

    resumoPorDia[dataChave][tipo] += valor;

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
  const resultado = [];

  // 🔹 obter o primeiro capital inicial (caso o histórico comece com 0)
  if (datas.length > 0) {
    const primeiraData = datas[0];
    const d0 = resumoPorDia[primeiraData];
    // se houver adição de liquidez no primeiro dia, usa como capital inicial
    if (d0.LiquidityAdd > 0) {
      capitaldia1 = d0.LiquidityAdd;
    }
  }

  for (const dataKey of datas) {
    const d = resumoPorDia[dataKey];
    const investimento = d.LiquidityAdd + d.LiquidityRemove;
    const lucro = d.OpenPosition;

    const capitalInicialDia = capital > 0 ? capital : capitaldia1;
    capital += investimento + lucro;
    lucroTotal += lucro;

    const transacoesDoDia = data.result.filter(tx => {
      return formatarDataSimples(tx.timeStamp) === dataKey;
    });

    const percentualPonderado = calculaPPT(transacoesDoDia, capitalInicialDia,signerAddress);

    resultado.push({
      data: dataKey,
      addRem: investimento,
      capital,
      lucroDia: lucro,
      lucroTotal,
      percentual: percentualPonderado, // capital !== 0 ? (lucro / capital) * 100 : 0,

      // novos campos POR DIA:
      operacoes: d.opCount,
      lucroBruto: d.lucroBruto,
      perdaBruta: d.perdaBruta
    });
  }

  // ---- Lucro últimas 24h (depois de preencher resultado)
  const agora = Math.floor(Date.now() / 1000);
  const limite24h = agora - 24 * 60 * 60;

  // Filtra apenas as operações OpenPosition nas últimas 24h
  const ultimas24hOps = data.result
    .filter(op => identificarTipoOperacaoPorNome(op.functionName) === "OpenPosition" && op.timeStamp >= limite24h)
    .map(op => {
      const valor = parseFloat(ethers.formatUnits(op.value, 6)) *
        (op.from.toLowerCase() === signerAddress.toLowerCase() ? -1 : 1);
      return { valor };
    });

  // ---- Estatísticas das 24h
  const lucro24hValor = ultimas24hOps.reduce((acc, op) => acc + op.valor, 0);
  const totalOperacoes24h = ultimas24hOps.length;
  const totalLucroBruto24h = ultimas24hOps.filter(op => op.valor >= 0).reduce((acc, op) => acc + op.valor, 0);
  const totalPerdaBruta24h = ultimas24hOps.filter(op => op.valor < 0).reduce((acc, op) => acc + Math.abs(op.valor), 0);

  // --- Calcula a porcentagem ---
  let capitalAntes24h = 0;

  // pega o último capital antes do início das últimas 24h
  for (let i = resultado.length - 1; i >= 0; i--) {
    const dataItem = new Date(resultado[i].data.split('/').reverse().join('-'));
    if (dataItem.getTime() / 1000 < limite24h) {
      capitalAntes24h = resultado[i].capital;
      break;
    }
  }

  // caso não tenha nenhum registro anterior, usa capital acumulado até agora
  if (capitalAntes24h === 0 && resultado.length > 0) {
    capitalAntes24h = resultado[resultado.length - 1].capital;
  }

  const lucro24hPercent = capitalAntes24h > 0 ? (lucro24hValor / capitalAntes24h) * 100 : 0;

  // objeto final das últimas 24h
  const lucro24h = {
    valor: lucro24hValor,
    percentual: lucro24hPercent,
    totalOperacoes: totalOperacoes24h,
    totalLucroBruto: totalLucroBruto24h,
    totalPerdaBruta: totalPerdaBruta24h
  };


  // Agora só retornamos 'resultado' (com métricas por dia) e 'lucro24h'
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
      totalOperacoes: 0,
      totalLucroBruto: 0,
      totalPerdaBruta: 0
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
    totalPerdaBruta
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

async function historico(carteira,api, token) {
  try {
    const signerAddress = carteira;
    const apiKey = api;
    const colateral = token;

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

    console.log(data)

    if (!data.result || !Array.isArray(data.result)) {
      return ctx.reply('Erro ao obter transações.');
    }

    const resumoPorDia = {};

    for (const tx of data.result) {
      const tipo = identificarTipoOperacaoPorNome(tx.functionName);
      if (tipo === 'Desconhecido') continue;

      const dataChave = formatarDataSimples(tx.timeStamp);
      const isSaida = tx.from.toLowerCase() === signerAddress.toLowerCase();
      const valor = parseFloat(ethers.formatUnits(tx.value, 6)) * (isSaida ? -1 : 1);

      if (!resumoPorDia[dataChave]) {
        resumoPorDia[dataChave] = { LiquidityAdd: 0, LiquidityRemove: 0, OpenPosition: 0 };
      }
      resumoPorDia[dataChave][tipo] += valor;
    }

    const csv = ['Data;Add/Rem;Capital;Lucro Dia;Lucro total; %'];
    const datas = Object.keys(resumoPorDia).sort((a, b) => {
      const [d1, m1, y1] = a.split('/').map(Number);
      const [d2, m2, y2] = b.split('/').map(Number);
      return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
    });

    let capital = 0;
    let lucroTotal = 0;

    // 🔹 obter o primeiro capital inicial (caso o histórico comece com 0)
    if (datas.length > 0) {
      const primeiraData = datas[0];
      const d0 = resumoPorDia[primeiraData];
      // se houver adição de liquidez no primeiro dia, usa como capital inicial
      if (d0.LiquidityAdd > 0) {
        capitaldia1 = d0.LiquidityAdd;
      }
    }

    for (const dataKey of datas) {
      const { LiquidityAdd, LiquidityRemove, OpenPosition } = resumoPorDia[dataKey];

      const investimento = LiquidityAdd + LiquidityRemove;
      const lucro = OpenPosition;

      const capitalInicialDia = capital > 0 ? capital : capitaldia1;
      capital += investimento + lucro;
      lucroTotal += lucro;

      const transacoesDoDia = data.result.filter(tx => {
        return formatarDataSimples(tx.timeStamp) === dataKey;
      });

      const percentual = calculaPPT(transacoesDoDia, capitalInicialDia,signerAddress);
      //const percentual = capital !== 0 ? (lucro / capital) * 100 : 0;

      csv.push(`${dataKey};${investimento.toFixed(2).replace('.', ',')};${capital.toFixed(2).replace('.', ',')};${lucro.toFixed(2).replace('.', ',')};${lucroTotal.toFixed(2).replace('.', ',')};${percentual.toFixed(2).replace('.', ',')}%`);

    }

    console.log(csv);
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