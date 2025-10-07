const { Scenes } = require("telegraf");
const User = require("../models/User");

// WizardScene para configurar carteira e RPC
const configScene = new Scenes.WizardScene(
  "config-wizard",
  async (ctx) => {
    ctx.reply("🔧 Envie sua carteira (endereço público):");
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.wallet = ctx.message.text.trim();
    ctx.reply("🔧 Agora envie sua URL do RPC da Polygon (ex: https://polygon-rpc.com)");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const rpc = ctx.message.text.trim();
    const wallet = ctx.wizard.state.wallet;
    const telegram_id = ctx.from.id.toString();

    const [user] = await User.findOrCreate({ where: { telegram_id } });
    user.wallet = wallet;
    user.rpc_url = rpc;
    await user.save();

    ctx.reply(`✅ Configurações salvas com sucesso!\n📬 Carteira: ${wallet}\n🌐 RPC: ${rpc}`);
    return ctx.scene.leave();
  }
);

module.exports = configScene;
