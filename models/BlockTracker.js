const { DataTypes } = require('sequelize');
const sequelize = require('../db/database'); 

const BlockTracker = sequelize.define('BlockTracker', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  lastBlock: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'block_tracker',
  timestamps: true // cria updatedAt e createdAt
});

module.exports = BlockTracker;
