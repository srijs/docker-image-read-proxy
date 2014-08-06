var http  = require('http'),
    https = require('https'),
    url   = require('url'),
    fs    = require('fs'),
    path  = require('path');

var config = require('./config');

var server = http.createServer(function (request, response) {

  var method   = request.method,
      pathname = url.parse(request.url).pathname,
      headers  = request.headers;

  if (config.https.auth)  {
    delete headers['authorization'];
    delete headers['x-docker-token'];
  }

  // We don't allow any non-read requests.
  if (method !== 'GET' && method !== 'HEAD') {
    response.writeHead(403);
    response.end();
    return;
  }

  var options = {
    hostname: 'index.docker.io',
    method:   method,
    path:     request.url,
    headers:  headers,
    agent:    false
  };

  Object.keys(config.https).forEach(function (key) {
    options[key] = config.https[key];
  });

  var file = '', match;
  if (match = request.url.match(/^\/v1\/images\/([a-f0-9]{64})\/([a-z]+)/)) {
    file = path.join(config.local.path, match[1] + '-' + match[2]);
  }

  fs.stat(file, function (err, stat) {
    
    if (err) {
    
      console.error('MISS ' + request.url);
      
      var backendRequest = https.request(options, function (backendResponse) {

        var fileWriteStream;

        backendResponse.on('error', function (err) {
          if (fileWriteStream) {
            fs.unlink(file, function (err) {
              console.error(err);
            });
          }
          console.error(err);
        });

        response.writeHead(backendResponse.statusCode, backendResponse.headers);

        backendResponse.on('data', function (data) {
          if (!response.write(data)) {
            backendResponse.pause();
          }
          if (!fileWriteStream && file && backendResponse.statusCode === 200) {
            fileWriteStream = fs.createWriteStream(file);
          }
          if (fileWriteStream) {
            if (!fileWriteStream.write(data)) {
              backendResponse.pause();
            }
          }
        });

        backendResponse.on('end', function () {
          response.end();
          if (fileWriteStream) {
            fileWriteStream.end();
          }
        });

      });

      backendRequest.on('error', function (error) {
        response.writeHead(500);
        console.error(error);
        response.end();
      });

      backendRequest.end();

    } else {

      var fileReadStream = fs.createReadStream(file);
      console.error('HIT  ' + request.url);
      response.writeHead(200);
      fileReadStream.pipe(response);

    }

  });

});

server.listen(7000);
