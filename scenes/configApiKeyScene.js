const { Scenes, Markup } = require("telegraf");
const User = require("../models/User");

const apiKeyScene = new Scenes.WizardScene(
  "config-apikey",

  // Etapa 0: Verificar se já existe uma API Key salva
  async (ctx) => {
    const telegram_id = ctx.from.id.toString();
    const [user] = await User.findOrCreate({ where: { telegram_id } });

    if (user.polygonscan_api_key) {
      await ctx.reply(`🔎 Sua PolygonScan API Key atual é:\n\`${user.polygonscan_api_key}\`\n\nDeseja manter ou alterar?`, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Manter", "manterApiKey")],
          [Markup.button.callback("✏️ Alterar", "alterarApiKey")]
        ])
      });
      return ctx.wizard.selectStep(2); // Pula para decisão
    }

    await ctx.reply("🔑 Envie sua chave da PolygonScan API:");
    return ctx.wizard.next();
  },

  // Etapa 1: Receber nova chave
  async (ctx) => {
    const key = ctx.message.text.trim();
    const telegram_id = ctx.from.id.toString();

    const [user] = await User.findOrCreate({ where: { telegram_id } });
    user.polygonscan_api_key = key;
    await user.save();

    ctx.reply(`✅ PolygonScan API Key atualizada!`);
    return ctx.scene.leave();
  },

  // Etapa 2: Lidar com a escolha de manter ou alterar
  async (ctx) => {
    if (ctx.callbackQuery?.data === "manterApiKey") {
      await ctx.answerCbQuery();
      await ctx.reply("✅ Chave mantida.");
      return ctx.scene.leave();
    } else if (ctx.callbackQuery?.data === "alterarApiKey") {
      await ctx.answerCbQuery();
      await ctx.reply("✏️ Envie a nova chave da PolygonScan API:");
      return ctx.wizard.selectStep(1);
    } else {
      ctx.reply("❌ Opção inválida.");
      return ctx.scene.leave();
    }
  }
);

module.exports = apiKeyScene;
