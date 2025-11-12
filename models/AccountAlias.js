// models/AccountAlias.js (novo arquivo)
const { DataTypes } = require('sequelize');
const sequelize = require('../db/database');

const AccountAlias = sequelize.define('AccountAlias', {
  account_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  friendly_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  telegram_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  indexes: [
    {
      unique: true,
      fields: ['telegram_id', 'account_id'],
      name: 'conta_alias'
    }
  ]
});

module.exports = AccountAlias;