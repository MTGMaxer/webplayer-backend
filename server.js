const http = require('http');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');

const PORT = 3000;

const server = http.createServer((req, res) => {
    switch (req.method) {
        case 'GET':
            handleGet(req, res);
            break;

        case 'POST':
            handlePost(req, res);
            break;

        default:
            notImplemented(res);
            break;
    }
});

function handleGet(req, res) {
    switch (req.url) {
        case '/':
            notFound(res);
            break;

        default:
            sendStaticFile(req.url, res);
            break;
    }
}

const DEFAULT_MIME = 'text/html';
const MIME_TYPES = {
    '': DEFAULT_MIME,
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/vnd.microsoft.icon',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.txt': 'text/plain',
    '.exe': 'application/octet-stream',
    '.mp3': 'audio/mpeg',
};

function getMimeTypeForUrl(url) {
    return MIME_TYPES[path.extname(url).toLowerCase()] || DEFAULT_MIME;
}

function sendStaticFile(url, res) {
    let filePath = path.join('static', decodeURIComponent(url));
    fs.readFile(filePath, (err, data) => {
        if (err) {
            notFound(res);
        } else {
            res.writeHead(200, { 'Content-Type': getMimeTypeForUrl(url) });
            res.end(data);
        }
    });
}

function handlePost(req, res) {
    switch (req.url) {
        case '/getAlbums':
            sendAlbums(req, res);
            break;

        case '/getAlbumContent':
            sendAlbumContent(req, res);
            break;

        default:
            notFound(res);
            break;
    }
}

const ALBUMS_PATH = path.join(__dirname, 'static', 'media', 'albums');

function sendAlbums(req, res) {
    fs.readdir(ALBUMS_PATH, (err, files) => {
        if (err) {
            console.error(err.message);
            serverError(res);
        } else {
            let albums = files.filter((file) => isDirectory(path.join(ALBUMS_PATH, file)));
            sendJson(res, albums);
        }
    });
}

function isDirectory(filePath) {
    return fs.statSync(filePath).isDirectory();
}

function sendAlbumContent(req, res) {
    parseBody(req, (data) => {
        let decodedName = decodeURIComponent(data.albumName);
        let albumPath = path.join(ALBUMS_PATH, decodedName);
        fs.readdir(albumPath, (err, files) => {
            if (err) {
                console.error(err);
                serverError(res);
            } else {
                let musicFiles = files.filter((file) => path.extname(file) === '.mp3').sort();
                Promise.all(musicFiles.map(async (file, index) => {
                    let filePath = path.join(albumPath, file);
                    let metadata = await mm.parseFile(filePath);
                    return {
                        filename: file,
                        albumName: decodedName,
                        title: metadata.common.title || file,
                        albumTitle: metadata.common.album || decodedName,
                        index: metadata.common.track.no || index + 1,
                        size: fs.statSync(filePath).size,
                    };
                })).then((tracksData) => sendJson(res, tracksData));
            }
        });
    });
}

function notFound(res) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>Not Found</h1>');
}

function serverError(res) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end('<h1>Internal Server Error</h1>');
}

function notImplemented(res) {
    res.writeHead(501, { 'Content-Type': 'text/html' });
    res.end('<h1>Not Implemented</h1>');
}

function sendJson(res, obj) {
    // TODO learn more about CORS
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
}

function parseBody(req, callback) {
    let data = [];
    req.on('data', (chunk) => data.push(chunk));
    req.on('end', () => callback(JSON.parse(data.join(''))));
}

server.listen(PORT);
