const { DataTypes } = require('sequelize');
const sequelize = require('../db/database'); 

//TransactionRecord.js
const TransactionRecord = sequelize.define('TransactionRecord', {
  id_telegran: DataTypes.INTEGER,
  hash: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  blockNumber: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  timestamp: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  value: {
    type: DataTypes.STRING,
    allowNull: false
  },
  operationType: {
    type: DataTypes.STRING,
    allowNull: false // OpenPosition, LiquidityAdd, LiquidityRemove
  }
}, {
  tableName: 'transaction_records',
  timestamps: true
});

module.exports = TransactionRecord;