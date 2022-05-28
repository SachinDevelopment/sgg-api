// import mariadb
var mariadb = require('mariadb');
require('dotenv').config();

console.log('process', process.env)
// create a new connection pool
const pool = mariadb.createPool({
  host: "127.0.0.1", 
  user: process.env.DB_USER, 
  password: process.env.DB_PASSWORD,
  database: process.env.DB
});

// expose the ability to create new connections
module.exports={
    getConnection: function(){
      return new Promise(function(resolve,reject){
        pool.getConnection().then(function(connection){
          resolve(connection);
        }).catch(function(error){
          reject(error);
        });
      });
    }
  } 