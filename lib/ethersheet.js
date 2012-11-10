var util = require("util");
var events = require("events");
var mysql = require('mysql');

/***********************************************
 * EtherSheetService
 ***********************************************/
var EtherSheetService = exports.EtherSheetService = function(config){
  events.EventEmitter.call(this);
  this.sql = mysql.createConnection({
    user: config.mysql_user,
    password: config.mysql_password,
    host: config.mysql_host,
    database: config.mysql_database
  });
}
// inherits from EventEmitter
util.inherits(EtherSheetService, events.EventEmitter);

// EtherSheet Internal Data
EtherSheetService.sheets = {};
EtherSheetService.colors = [
  '#0EF012',
  '#1BA5E0',
  '#a233ca',
  '#DFF25E',
  '#F283F0',
  '#FAA166',
  '#FC3F52'
];

// EtherSheet API
EtherSheetService.prototype.find_or_create_user = function(user_id, cb){
  var es = this;
  es.sql.query(
    'SELECT * FROM users WHERE user_id = ?', 
    [user_id], 
    function(err, results, fields) {
      if(results.length > 0){ //  user exists
        cb(err, results[0], results);
      } else {
        es.sql.query(
          'INSERT INTO users (user_id, color) VALUES (?, ?)',
          [user_id, es.get_random_color()],
          function(err, results, fields){
            if(err) {
              throw err;
            } else {
              es.find_or_create_user(user_id, cb);
            }
          }
        );
      }
    }
  );
}

EtherSheetService.prototype.add_user_to_room = function(user, sheet_id, cb){
  EtherSheetService.sheets[sheet_id] = EtherSheetService.sheets[sheet_id] || {count:0, users:{}};
  EtherSheetService.sheets[sheet_id].count++;
  EtherSheetService.sheets[sheet_id].users[user.user_id] = user;
  cb(null, null);
};

EtherSheetService.prototype.remove_user_from_room = function(user, sheet_id){
  delete(EtherSheetService.sheets[sheet_id].users[user.user_id]);
  EtherSheetService.sheets[sheet_id].count--;
  if(EtherSheetService.sheets[sheet_id].count < 1){
    delete(EtherSheetService.sheets[sheet_id]);
  }
}

EtherSheetService.prototype.get_random_color = function(){
  var idx = Math.floor(Math.random() * 100);  
  return EtherSheetService.colors[idx % EtherSheetService.colors.length]
};

EtherSheetService.prototype.save_sheet = function(sheet_id, sheet_data){
  this.sql.query(
    'UPDATE sheets SET sheetdata = ? WHERE sheetid = ?', [sheet_data, sheet_id],
    function(err, results, fields){
      if(err){
        console.log('ERROR: ' + err);
      }
    }
  );
};

EtherSheetService.prototype.find_or_create_sheet = function(sheet_id,cb){
  var es = this;
  es.sql.query(
    'SELECT * FROM sheets WHERE sheetid = ?', 
    [sheet_id], 
    function(err, results, fields) {
      if(results.length > 0){ // a sheet exists
        //load the data and emit an event
        cb(err, results[0], results);
      } else {
        //create a new sheet
        es.create_sheet(sheet_id,cb);
      }
    }
  );
};

EtherSheetService.prototype.create_sheet = function(sheet_id,cb){
  var es = this;
  es.sql.query(
    'INSERT INTO sheets VALUES (?, ?)',
    [sheet_id, ''],
    function(err, results, fields){
      cb(err, {sheetid: sheet_id, sheetdata: ""}, results);
    }
  );
}; 

EtherSheetService.prototype.delete_user = function(user_id, cb){
  var es = this;
  es.sql.query(
    'DELETE FROM users WHERE user_id = ?', [user_id],
    function(err, results){
      cb(err, results);
    }
  );
};

EtherSheetService.prototype.delete_sheet = function(sheetid, cb){
  var es = this;
  es.sql.query(
    'DELETE FROM sheets WHERE sheetid = ?', [sheetid],
    function(err, results){
      cb(err, results);
    }
  );
};
