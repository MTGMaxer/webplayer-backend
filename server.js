const http = require('http');
const fs = require('fs');
const path = require('path');
const qs = require('querystring');
const formidable = require('formidable');
const mm = require('music-metadata');

const playlist = require('./playlist');

const PORT = process.env.PORT || 3000;

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
            sendStaticFile(req, res);
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

const URL_ALIASES = {
    '/admin': '/admin.html',
};

function sendStaticFile(req, res) {
    let url = URL_ALIASES[req.url] || req.url;
    let filePath = path.join('static', decodeURIComponent(url));

    fs.stat(filePath, (err, stats) => {
        if (err || stats.isDirectory()) {
            notFound(res);
            return;
        }
        let fileSize = stats.size;
        let headers = {
            'Accept-Ranges': 'bytes',
            'Content-Type': getMimeTypeForUrl(url),
            'Content-Length': fileSize,
        };

        let reqRange = req.headers.range;
        if (reqRange) {
            let [start, end] = reqRange.replace(/bytes=/, '').split('-');
            start = parseInt(start);
            end = end ? parseInt(end) : fileSize - 1;

            if (!Number.isNaN(start) && Number.isNaN(end)) {
                end = fileSize - 1;
            }

            if (Number.isNaN(start) && !Number.isNaN(end)) {
                start = fileSize - end;
                end = fileSize - 1;
            }

            if (start >= fileSize || end >= fileSize) {
                res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
                res.end();
                return;
            }

            headers['Content-Length'] = end - start + 1;
            headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
            res.writeHead(206, headers);

            let readStream = fs.createReadStream(filePath, { start, end });
            readStream.pipe(res);
        } else {
            res.writeHead(200, headers);
            let readStream = fs.createReadStream(filePath);
            readStream.pipe(res);
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

        case '/getPlaylist':
            sendPlaylist(req, res);
            break;

        case '/addTrackToPlaylist':
            addTrackToPlaylist(req, res);
            break;

        case '/upload':
            albumUpload(req, res);
            break;

        default:
            notFoundJson(res);
            break;
    }
}

const ALBUMS_PATH = path.join(__dirname, 'static', 'media', 'albums');

function sendAlbums(req, res) {
    fs.readdir(ALBUMS_PATH, (err, files) => {
        if (err) {
            console.error(err.message);
            serverErrorJson(res);
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
    parseJsonBody(req, (data) => {
        let decodedName = decodeURIComponent(data.albumName);
        let albumPath = path.join(ALBUMS_PATH, decodedName);
        fs.readdir(albumPath, (err, files) => {
            if (err) {
                console.error(err);
                serverErrorJson(res);
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

function sendPlaylist(req, res) {
    playlist.getTracks((err, tracks) => {
        if (err) {
            console.error(err);
            serverErrorJson(res);
        } else {
            sendJson(res, tracks);
        }
    });
}

function addTrackToPlaylist(req, res) {
    parseJsonBody(req, (track) => {
        playlist.addTrack(track, (err, newTrack) => {
            if (err) {
                serverErrorJson(res);
            } else {
                sendJson(res, newTrack);
            }
        });
    });
}

function albumUpload(req, res) {
    const form = formidable({
        multiples: true,
        keepExtensions: true,
        uploadDir: 'static/media/albums/Untitled Upload',
    });
    let uploadedFiles = [];
    form.parse(req, (err, fields, files) => {
        if (err) {
            console.error(err);
            serverErrorJson(res);
        } else {
            files = files.file;
            if (!Array.isArray(files)) {
                files = [files];
            }
            let albumName = fields.albumname || 'Untitled Upload';
            albumName = albumName.trim();
            let newDir = path.join(__dirname, 'static/media/albums', albumName);
            files.forEach((file) => {
                if (!fs.existsSync(newDir)) {
                    fs.mkdir(newDir, (mkdirErr) => {
                        if (!mkdirErr) {
                            renameFile(file, newDir, uploadedFiles);
                        }
                    });
                } else {
                    renameFile(file, newDir, uploadedFiles);
                }
                uploadedFiles.push(file.name);
            });
        }
    });
    form.on('end', () => {
        sendJson(res, uploadedFiles);
    });
}

function renameFile(file, newDir) {
    fs.rename(path.join(__dirname, file.path), path.join(newDir, file.name),
        (renameErr) => {
            if (renameErr) {
                console.error(renameErr);
            }
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
    res.writeHead(501, { 'Content-Type': 'text/plain' });
    res.end('Not Implemented');
}

function sendJson(res, obj) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
}

function notFoundJson(res) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ Status: 'Not Found' }));
}

function serverErrorJson(res) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ Status: 'Internal Server Error' }));
}

function parseJsonBody(req, callback) {
    let data = [];
    req.on('data', (chunk) => data.push(chunk));
    req.on('end', () => callback(JSON.parse(data.join(''))));
}

function parseBody(req, callback) {
    let data = [];
    req.on('data', (chunk) => data.push(chunk));
    req.on('end', () => callback(qs.parse(data.join(''))));
}

server.listen(PORT);
