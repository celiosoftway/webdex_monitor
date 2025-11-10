const { Sequelize } = require('sequelize');

/*
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './db/database.sqlite',
  logging: false,
});
*/

// Configuração do Sequelize para MySQL
const sequelize = new Sequelize({
    dialect: 'mysql',
    host: process.env.BD_HOST,          
    port: 3306,                 
    database: process.env.BD_BANCO,  
    username: process.env.BD_USER,    
    password: process.env.BD_SENHA,     
    logging: false,            
});

module.exports = sequelize;