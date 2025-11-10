// scenes/configContasScene.js (novo arquivo)
const { Scenes, Markup } = require("telegraf");
const AccountAlias = require("../models/AccountAlias");

const configContasScene = new Scenes.WizardScene(
  "config-contas",
  async (ctx) => {
    await ctx.reply("⚙️ Configurar Contas:", Markup.inlineKeyboard([
      [Markup.button.callback("📋 Ver contas", "ver")],
      [Markup.button.callback("➕ Cadastrar contas", "cadastrar")],
      [Markup.button.callback("❌ Excluir contas", "excluir")],
    ]));
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return ctx.scene.leave();
    const action = ctx.callbackQuery.data;
    await ctx.answerCbQuery();
    const telegram_id = ctx.from.id.toString();
    if (action === "ver") {
      const aliases = await AccountAlias.findAll({ where: { telegram_id } });
      if (aliases.length === 0) {
        await ctx.reply("⚠️ Nenhuma conta cadastrada.");
      } else {
        let msg = "📋 Suas contas:\n\n";
        aliases.forEach(a => {
          msg += `🆔 ${a.account_id}: ${a.friendly_name}\n`;
        });
        await ctx.reply(msg);
      }
      return ctx.scene.leave();
    } else if (action === "cadastrar") {
      await ctx.reply("➕ Envie o ID da conta:");
      ctx.wizard.state.action = "cadastrar";
      return ctx.wizard.next();
    } else if (action === "excluir") {
      const aliases = await AccountAlias.findAll({ where: { telegram_id } });
      if (aliases.length === 0) {
        await ctx.reply("⚠️ Nenhuma conta para excluir.");
        return ctx.scene.leave();
      }
      const buttons = aliases.map(a => [
        Markup.button.callback(`${a.account_id}: ${a.friendly_name}`, `delete_${a.id}`)
      ]);
      await ctx.reply("❌ Selecione a conta para excluir:", Markup.inlineKeyboard(buttons));
      ctx.wizard.state.action = "excluir";
      return ctx.wizard.next();
    }
    return ctx.scene.leave();
  },
  async (ctx) => {
    const { action } = ctx.wizard.state;
    const telegram_id = ctx.from.id.toString();
    if (action === "cadastrar") {
      if (!ctx.message) return ctx.scene.leave();
      const account_id = ctx.message.text.trim();
      ctx.wizard.state.account_id = account_id;
      await ctx.reply("📝 Envie o nome amigável:");
      return ctx.wizard.next();
    } else if (action === "excluir") {
      if (!ctx.callbackQuery) return ctx.scene.leave();
      const data = ctx.callbackQuery.data;
      await ctx.answerCbQuery();
      if (data.startsWith("delete_")) {
        const id = data.split("_")[1];
        await AccountAlias.destroy({ where: { id } });
        await ctx.reply("✅ Conta excluída com sucesso.");
        return ctx.scene.leave();
      }
    }
    return ctx.scene.leave();
  },
  async (ctx) => {
    const { account_id } = ctx.wizard.state;
    if (!ctx.message) return ctx.scene.leave();
    const friendly_name = ctx.message.text.trim();
    const telegram_id = ctx.from.id.toString();
    const [alias, created] = await AccountAlias.findOrCreate({
      where: { telegram_id, account_id },
      defaults: { friendly_name }
    });
    if (!created) {
      alias.friendly_name = friendly_name;
      await alias.save();
      await ctx.reply(`✅ Conta atualizada: ${account_id} -> ${friendly_name}`);
    } else {
      await ctx.reply(`✅ Conta cadastrada: ${account_id} -> ${friendly_name}`);
    }
    return ctx.scene.leave();
  }
);

module.exports = configContasScene;