const { Sequelize, DataTypes } = require('sequelize');
require("dotenv").config();

/*
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: '.database.sqlite',
    logging: false,
});

*/

// Configuração do Sequelize para MySQL
const sequelize = new Sequelize({
    dialect: 'mysql',
    host: process.env.BI_BD_HOST,          
    port: 3306,                 
    database: process.env.BI_BD_BANCO,  
    username: process.env.BI_BD_USER,    
    password: process.env.BI_BD_SENHA,     
    logging: false,            
});


// Definir modelos para o banco de dados
const Transaction = sequelize.define('Transaction', {
    carteira: { type: DataTypes.STRING },
    dataFormatada: { type: DataTypes.STRING },
    datasimples: { type: DataTypes.STRING },

    functionName: { type: DataTypes.STRING },
    strategy: { type: DataTypes.STRING },
    conta: { type: DataTypes.STRING },

    blockNumber: { type: DataTypes.INTEGER },
    timeStamp: { type: DataTypes.INTEGER },

    hash: { type: DataTypes.STRING, unique: true },

    from: { type: DataTypes.STRING },
    to: { type: DataTypes.STRING },
    value: { type: DataTypes.STRING },

    token: { type: DataTypes.STRING },
    tokenSymbol: { type: DataTypes.STRING },
    tokenDecimal: { type: DataTypes.INTEGER },

    isSaida: { type: DataTypes.BOOLEAN },
    valor: { type: DataTypes.FLOAT },

    gasUsed: { type: DataTypes.STRING },
    gasPrice: { type: DataTypes.STRING },
    totalWei: { type: DataTypes.STRING },
    gasValor: { type: DataTypes.FLOAT },

    gasCobrado: { type: DataTypes.FLOAT },
    gasWebdex: { type: DataTypes.FLOAT },

    // 🔴 CORRIGIDO
    decodeStatus: {
        type: DataTypes.ENUM('PENDING', 'RUNNING', 'OK', 'ERROR'),
        allowNull: false,
        defaultValue: 'PENDING'
    },

    // 🔹 ADICIONADOS (essenciais)
    decodeError: {
        type: DataTypes.TEXT,
        allowNull: true
    },

    decodeStartedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },

    decodeAttempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },

    decodeWorker: {
        type: DataTypes.STRING,
        allowNull: true
    }

}, {
    indexes: [
        { fields: ['hash'], unique: true },
        { fields: ['decodeStatus'] },
        { fields: ['blockNumber'] }
    ]
});


const BlockTracker = sequelize.define('BlockTracker', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    blockStart: {
        type: DataTypes.INTEGER,
        allowNull: false
    },

    blockEnd: {
        type: DataTypes.INTEGER,
        allowNull: false
    },

    status: {
        type: DataTypes.ENUM('PENDING', 'RUNNING', 'DONE', 'ERROR'),
        allowNull: false,
        defaultValue: 'PENDING'
    },

    startedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },

    finishedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },

    workerId: {
        type: DataTypes.STRING,
        allowNull: true
    },

    attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    }

}, {
    tableName: 'block_tracker',
    timestamps: true,
    indexes: [
        { fields: ['status'] },
        { fields: ['blockStart'] },
        { fields: ['blockEnd'] }
    ]
});

module.exports = {
    sequelize,
    Transaction,
    BlockTracker
};