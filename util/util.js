
const axios = require('axios');

function formatarDataSimples(timestamp) {
  const date = new Date(timestamp * 1000);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

// Função auxiliar para converter timestamp em data legível
function formatarData(timestamp) {
  const data = new Date(timestamp * 1000); // timestamp vem em segundos
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  const hora = String(data.getHours()).padStart(2, '0');
  const minuto = String(data.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

function identificarTipoOperacaoPorNome(functionName) {
  if (!functionName) return 'Desconhecido';

  if (functionName.startsWith('LiquidityAdd')) {
    return 'LiquidityAdd';
  }
  if (functionName.startsWith('LiquidityRemove')) {
    return 'LiquidityRemove';
  }
  if (functionName.startsWith('openPosition')) {
    return 'OpenPosition';
  }

  return 'Desconhecido';
}

async function getCMCPrice(crypto = "POL", convert = "USD") {
  const url = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest";

  try {
    const { data } = await axios.get(url, {
      params: { symbol: crypto, convert },
      headers: {
        "X-CMC_PRO_API_KEY": "6cc6d57b-3db2-4e18-84f7-52b7a2c853bc",
        "Accept": "application/json",
      },
    });

    const price = data.data[crypto].quote[convert].price;
    console.log(`${crypto} = ${price.toFixed(4)} ${convert}`);
    return price;
  } catch (error) {
    console.error("Erro ao obter preço:", error.response?.data || error.message);
    return null;
  }
}

// (async() => {  const price = await getCMCPrice();})()

module.exports = {
    formatarData,
    formatarDataSimples,
    identificarTipoOperacaoPorNome,
    getCMCPrice
};