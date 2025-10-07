const { DataTypes } = require('sequelize');
const sequelize = require('../db/database'); 

const transacoes = sequelize.define('transacoes', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  data: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  hash: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
}, {
  tableName: 'transacoes',
  timestamps: true // cria updatedAt e createdAt
});

module.exports = transacoes;