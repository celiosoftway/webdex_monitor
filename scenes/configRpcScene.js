const { Scenes, Markup } = require("telegraf");
const User = require("../models/User");

const rpcScene = new Scenes.WizardScene(
  "config-rpc",

  // Etapa 0: Verifica se o RPC já está configurado
  async (ctx) => {
    const telegram_id = ctx.from.id.toString();
    const [user] = await User.findOrCreate({ where: { telegram_id } });

    if (user.rpc_url) {
      await ctx.reply(
        `🌐 Seu RPC atual é:\n\`${user.rpc_url}\`\n\nDeseja manter ou alterar?`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Manter", "manterRPC")],
            [Markup.button.callback("✏️ Alterar", "alterarRPC")]
          ])
        }
      );
      return ctx.wizard.selectStep(2); // Vai direto para a decisão
    }

    await ctx.reply("🌐 Envie a URL do RPC da Polygon (ex: https://polygon-rpc.com)");
    return ctx.wizard.next();
  },

  // Etapa 1: Recebe novo RPC
  async (ctx) => {
    const rpc_url = ctx.message.text.trim();
    const telegram_id = ctx.from.id.toString();

    const [user] = await User.findOrCreate({ where: { telegram_id } });
    user.rpc_url = rpc_url;
    await user.save();

    ctx.reply(`✅ RPC atualizado: ${rpc_url}`);
    return ctx.scene.leave();
  },

  // Etapa 2: Lida com a escolha de manter ou alterar
  async (ctx) => {
    if (ctx.callbackQuery?.data === "manterRPC") {
      await ctx.answerCbQuery();
      await ctx.reply("✅ RPC mantido.");
      return ctx.scene.leave();
    } else if (ctx.callbackQuery?.data === "alterarRPC") {
      await ctx.answerCbQuery();
      await ctx.reply("✏️ Envie a nova URL do RPC:");
      return ctx.wizard.selectStep(1);
    } else {
      ctx.reply("❌ Opção inválida.");
      return ctx.scene.leave();
    }
  }
);

module.exports = rpcScene;
