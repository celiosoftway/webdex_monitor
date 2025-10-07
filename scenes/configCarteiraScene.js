const { Scenes, Markup } = require("telegraf");
const User = require("../models/User");

const carteiraScene = new Scenes.WizardScene(
  "config-carteira",
  async (ctx) => {
    const telegram_id = ctx.from.id.toString();
    const [user] = await User.findOrCreate({ where: { telegram_id } });

    if (user.wallet) {
      await ctx.reply(`🔎 Sua carteira atual é:\n\`${user.wallet}\`\n\nDeseja manter ou alterar?`, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Manter", "manterCarteira")],
          [Markup.button.callback("✏️ Alterar", "alterarCarteira")]
        ])
      });
      return ctx.wizard.selectStep(2); // Pula para a próxima etapa, esperando decisão
    }

    await ctx.reply("🔧 Envie sua carteira (endereço público):");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const carteira = ctx.message.text.trim();
    const telegram_id = ctx.from.id.toString();
    const [user] = await User.findOrCreate({ where: { telegram_id } });

    user.wallet = carteira;
    await user.save();

    ctx.reply(`✅ Carteira atualizada: ${carteira}`);
    return ctx.scene.leave();
  },
  async (ctx) => {
    if (ctx.callbackQuery?.data === "manterCarteira") {
      await ctx.answerCbQuery();
      ctx.reply("✅ Carteira mantida.");
      return ctx.scene.leave();
    } else if (ctx.callbackQuery?.data === "alterarCarteira") {
      await ctx.answerCbQuery();
      await ctx.reply("✏️ Envie a nova carteira:");
      return ctx.wizard.selectStep(1);
    } else {
      ctx.reply("❌ Opção inválida.");
      return ctx.scene.leave();
    }
  }
);

module.exports = carteiraScene;
