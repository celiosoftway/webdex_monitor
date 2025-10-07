
const { DataTypes } = require('sequelize');
const sequelize = require('../db/database'); 

const SyncLog = sequelize.define('SyncLog', {
  fromBlock: DataTypes.INTEGER,
  toBlock: DataTypes.INTEGER,
  user:DataTypes.INTEGER,
  includedCount: DataTypes.INTEGER,

  executedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'sync_logs',
  timestamps: false
});

module.exports = SyncLog;