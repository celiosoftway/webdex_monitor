const { DataTypes } = require('sequelize');
const sequelize = require('../db/database'); 

const User = sequelize.define('User', {
  telegram_id: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  wallet: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  rpc_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  polygonscan_api_key: {     
    type: DataTypes.STRING,
    allowNull: true,
  }
});

module.exports = User;