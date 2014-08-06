var http  = require('http'),
    https = require('https'),
    path  = require('path'),
    fs    = require('fs');

var config = require('./config');

var server = http.createServer(function (request, response) {

  var method   = request.method,
      pathname = request.url,
      headers  = request.headers,
      length   = parseInt(headers['content-length'], 10);

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

  var key = '', temp, file = '', match;
  if (match = request.url.match(/^\/v1\/images\/([a-f0-9]{64})\/([a-z]+)/)) {
    key  = match[1] + '-' + match[2];
    temp = path.join('/tmp', key + '-' + Date.now());
    file = path.join(config.local.path, key);
  }

  fs.stat(file, function (err, stat) {
    
    if (!err) {
      response.writeHead(200);
      fs.createReadStream(file).pipe(response);
      return;
    }

    console.error('MISS ' + request.url);
    
    var backendRequest = https.request(options, function (backendResponse) {

      var fileWriteStream, bytesWritten = 0;

      console.log(backendResponse.headers);

      response.writeHead(backendResponse.statusCode, backendResponse.headers);

      backendResponse.on('data', function (data) {
        bytesWritten += data.length;
        if (!response.write(data)) {
          backendResponse.pause();
        }
        if (!fileWriteStream && file && backendResponse.statusCode === 200) {
          fileWriteStream = fs.createWriteStream(temp);
        }
        if (fileWriteStream && !fileWriteStream.write(data)) {
          backendResponse.pause();
        }
      });

      backendResponse.on('error', function (err) {
        console.error(err);
      });

      backendResponse.once('end', function () {
        response.end();
        if (fileWriteStream) {
          fileWriteStream.end();
          if (bytesWritten < length) {
            fs.unlink(temp, function (err) {
              if (err) {
                console.error(err);
              }
            });
          } else {
            fs.rename(temp, file, function (err) {
              if (err) {
                console.error(err);
              }
            });
          }
        }
      });

    });

    backendRequest.on('error', function (error) {
      response.writeHead(500);
      console.error(error);
      response.end();
    });

    backendRequest.end();

  });

});

server.listen(7000);
