const Datastore = require('nedb');

const db = new Datastore({ filename: 'db/playlist.db', autoload: true });

db.ensureIndex({ fieldName: 'index', unique: true });

module.exports = {

    addTrack(track, callback) {
        db.find({}, (err, existingTracks) => {
            if (err) {
                callback(err, null);
            } else {
                track.index = existingTracks.length;
                db.insert(track, (error, newTrack) => {
                    callback(error, newTrack);
                });
            }
        });
    },

    clear(callback) {
        db.remove({}, { multi: true }, (err, numRemoved) => {
            callback(err, numRemoved);
        });
    },

    getTracks(callback) {
        db.find({}, (err, tracks) => {
            callback(err, tracks);
        });
    },
};
