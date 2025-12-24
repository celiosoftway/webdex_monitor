
require("dotenv").config();
const sequelize = require("./db/database");
const User = require("./models/User");

// Inicializar DB
(async () => {
    await sequelize.sync();
})();


async function users() {
    console.clear();
    try {
        const usuarios = await User.findAll();
        console.log(`🕵️‍♂️ Verificando ${usuarios.length}`);

        for (const user of usuarios) {
            if (!user.wallet || !user.rpc_url || !user.polygonscan_api_key) continue;

  
                let mensagem = `\n\nUser: ${user.telegram_id}\n`;
                    mensagem += `Wallet: ${user.wallet}\n`;
                    mensagem += `RPC: ${user.rpc_url}\n`;
                    mensagem += `API: ${user.polygonscan_api_key}\n`;

                console.log(mensagem)
        }

    } catch (err) {
        console.error("❌ Erro geral no monitoramento de openPositions:", err);
    }
}

users()