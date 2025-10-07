
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


module.exports = {
    formatarData,
    formatarDataSimples,
    identificarTipoOperacaoPorNome
};