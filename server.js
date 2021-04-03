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
    '.svg': 'image/svg+xml',
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
            Promise.all(files.map(async (file) => {
                let stats = await fs.promises.stat(path.join(ALBUMS_PATH, file));
                return {
                    isDir: stats.isDirectory(),
                    name: file,
                };
            }))
                .then((mapped) => mapped.filter((obj) => obj.isDir))
                .then((filtered) => filtered.map((obj) => obj.name))
                .then((albums) => sendJson(res, albums));
        }
    });
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
                    let stats = await fs.promises.stat(filePath);
                    return {
                        filename: file,
                        albumName: decodedName,
                        title: metadata.common.title || file,
                        albumTitle: metadata.common.album || decodedName,
                        index: metadata.common.track.no || index + 1,
                        size: stats.size,
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

function newAlbumName() {
    const rd = () => Math.trunc(Math.random() * 10);
    return Date.now().toString().substring(8) + rd() + rd() + rd() + rd() + rd();
}

function albumUpload(req, res) {
    let randomName = newAlbumName();
    let uploadDir = path.join(ALBUMS_PATH, randomName);
    fs.access(uploadDir, (nonexistent) => {
        if (nonexistent) {
            fs.mkdir(uploadDir, (mkdirErr) => {
                if (mkdirErr) {
                    serverErrorJson(res);
                } else {
                    const form = formidable({
                        multiples: true,
                        keepExtensions: true,
                        uploadDir,
                    });
                    form.parse(req, (err, fields, files) => {
                        if (err) {
                            console.error(err);
                            serverErrorJson(res);
                        } else {
                            files = files.file;
                            if (!Array.isArray(files)) {
                                files = [files];
                            }
                            let customName = fields.albumname;
                            if (customName) {
                                customName = customName.trim();
                            }
                            Promise.all(files.map(async (file) => {
                                await renameFile(file);
                                return file.name;
                            }))
                                .then(async (uploadedFiles) => {
                                    if (customName) {
                                        let newDir = path.join(ALBUMS_PATH, customName);
                                        await fs.promises.rename(uploadDir, newDir);
                                    }
                                    return uploadedFiles;
                                })
                                .then((uploadedFiles) => {
                                    sendJson(res, uploadedFiles);
                                })
                                .catch((error) => {
                                    console.error(error);
                                    serverErrorJson(res);
                                });
                        }
                    });
                }
            });
        } else {
            serverErrorJson(res);
        }
    });
}

function renameFile(file) {
    return fs.promises.rename(file.path, path.join(path.dirname(file.path), file.name));
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
