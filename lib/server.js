var http = require('http');
var https = require('https');
var express = require('express');
var socket_io = require('socket.io');
var fs = require('fs');
var stitchit = require('stitchit');
var EtherSheetService = require('./ethersheet').EtherSheetService;

var ES_PROTOTYPE_CLIENT_PATH= __dirname + '/node_modules/es_prototype_client';
var ES_CLIENT_PATH= __dirname + '/../node_modules/es_client';
var LAYOUT_PATH = __dirname + '/layouts';

// Note: templates should be fixed to load using require in the client
// and not need the server to be aware of them
var TEMPLATE_PATH = ES_CLIENT_PATH + '/templates/';
var TEMPLATE_NAMESPACE = 'module.exports';


exports.createServer = function(config){


  // create a db connection 
  var es = new EtherSheetService(config);


  /***********************************************
  * EtherSheet HTTPS Server
  ***********************************************/
  var cert ={
    key: fs.readFileSync(config.https_key),
    cert: fs.readFileSync(config.https_cert)
  };
  var app = express();
  var server = https.createServer(cert,app);

  // Server Settings
  app.set('views',LAYOUT_PATH);
  app.use(express.logger({ format: ':method :url' }));

  // prototype client 
  app.use(express.static(ES_PROTOTYPE_CLIENT_PATH));

  // client modules
  app.use('/es_client',express.static(ES_CLIENT_PATH));

  // listen after setup
  process.nextTick(function(){
    server.listen(config.port, config.host, function(){
      console.log('ethersheet is listening over https on port ' + config.port);
    });
  });


  /**********************************************
  * HTTP Routes
  **********************************************/
  //index
  app.get('/', function(req,res){
    res.render('index.ejs');
  });

  // save the sheet
  app.post('/save', express.bodyParser(), function(req,res){
    es.save_sheet(req.body.sheet_id, req.body.sheet_data);
    res.send(req.body.sheet_id);
  });

  //get the sheet in json form
  app.get('/s/:sheetid.json', function(req,res){
    es.find_or_create_sheet(req.params.sheetid, function(err, sheet){
      if(err){
        throw(err);
      }
      res.send(sheet.sheetdata);
    });
  });

  // sheet entry page
  app.get('/s/:sheetid', function(req,res){
    res.render('jquery.sheet.ejs', {sheet_id: req.params.sheetid, socket_port: config.port});
  });


  app.get('/es_client/templates.js', function(req,res){
    stitchit({path:TEMPLATE_PATH,namespace:TEMPLATE_NAMESPACE},function(err,templates){
      if(err) throw err;

      templates = 
        "if (typeof define !== 'function') { var define = require('amdefine')(module) }\n"+
        "define( function(require,exports,module){\n\n"+
        "var _ = require('underscore');\n"+
        "var helpers = require('es_client/helpers');\n"+
        templates+
        "\n});\n";

      res.send(templates);
    });
  });


  /***********************************************
  * Socket.io
  ***********************************************/
  var io = socket_io.listen(server);

  io.sockets.on('connection', function(socket){

    socket.on('JOIN_ROOM', function(data){
      es.find_or_create_user(data.user_id, function(err, user){ 
        if(err) throw(err);
        socket.udata = user;
        socket.udata.sheet_id = data.sheet_id;
        es.add_user_to_room(socket.udata, data.sheet_id, function(err){
          if(err) throw(err);
          socket.join(data.sheet_id);
          socket.emit('ROOM_JOINED');
          io.sockets.in(data.sheet_id).emit(
            'USER_CHANGE', 
            {user: user, action: 'JOINED', sheet_data:EtherSheetService.sheets[data.sheet_id]}
          );
        });
      });
    });
    
    //use this for messages that are passed only to other clients
    //and don't need to interact with the server.
    socket.on('message', function(data){
      socket.broadcast.to(socket.udata.sheet_id).emit('message', data);
    });

    socket.on('disconnect', function(){
      if(socket.udata){
        socket.leave(socket.udata.sheet_id);
        es.remove_user_from_room(socket.udata, socket.udata.sheet_id);
        io.sockets.in(socket.udata.sheet_id).emit('USER_CHANGE', {user: socket.udata, action: 'LEFT', sheet_data:EtherSheetService.sheets[socket.udata.sheet_id]});
      }
    });

  });


  /***********************************************
  * HTTP Redirection Server 
  ***********************************************/
  // set up plain http server
  var redirector = express();

  // set up a route to redirect http to https
  redirector.get('*',function(req,res){  
    res.redirect('https://ethersheet.org'+req.url)
  })

  // have it listen
  http.createServer(redirector).listen(config.plaintext_port);
 
  return app;
}
