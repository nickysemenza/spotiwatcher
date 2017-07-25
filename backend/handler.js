'use strict';
let SpotifyWebApi = require('spotify-web-api-node');
const AWS = require('aws-sdk');
AWS.config.setPromisesDependency(require('bluebird'));
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const uuid = require('uuid');
const crypto = require('crypto');


function comparer(otherArray){
    return current => otherArray.filter(other => other.uri === current.uri).length === 0
}

/*
 * Calculates the diffs based on the data in PLAYLIST_CONTENTS_TABLE
 *   store diffs between fetches in PLAYLIST_DIFFS_TABLE
 *  (this runs on a cron)
 */
module.exports.calculateDiffs = (event, context, callback) => {

    return new Promise((resolve, reject) => {
        dynamoDb.scan({
            TableName: process.env.PLAYLIST_CONTENTS_TABLE
        }).promise().then((data)=>{
            let UriHash = {};

            data.Items.forEach(item=>{
                if(!UriHash[item.uri])
                    UriHash[item.uri] = [];
                UriHash[item.uri].push(item);
            });

            // console.log(UriHash);

            let persistDiffPromises = [];

            Object.keys(UriHash).forEach(function(uri) {
                // console.log("aah",key, UriHash[key]);
                //sort new->old
                UriHash[uri].sort(function(a,b) {return (a.timestamp < b.timestamp) ? 1 : ((b.timestamp < a.timestamp) ? -1 : 0);} );


                let thisPlaylistVersionItem = UriHash[uri];
                for(let x=0; x < thisPlaylistVersionItem.length-1; x++) {
                    let newerItem = thisPlaylistVersionItem[x];
                    let olderItem = thisPlaylistVersionItem[x+1];

                    let newer = newerItem.contents;
                    let older = olderItem.contents;

                    let { name }  = newerItem;

                    console.log(`Comparing playlist ${uri} (${name}) newer@${newerItem.timestamp}: ${newer.length} items, older@${olderItem.timestamp}: ${older.length} items`);
                    let onlyInNewer = newer.filter(comparer(older));

                    if(onlyInNewer.length > 0) {
                        //persist it
                        console.log('diff:',onlyInNewer);
                        let { playlistId } = splitPlaylistURI(uri);

                        //create a hash out of uri Array to use has primary key
                        let uriHash = crypto.createHash('md5').update(onlyInNewer.map(d=>d.uri).join()).digest("hex");

                        persistDiffPromises.push(new Promise((resolveDBSave, rejectDBSave) => {
                            dynamoDb.put({
                                TableName: process.env.PLAYLIST_DIFFS_TABLE,
                                Item: {
                                    id: uriHash,
                                    diff: onlyInNewer,
                                    playlistId,
                                    uri,
                                    name,
                                }
                            }).promise().then(()=>resolveDBSave());
                        }));
                    }
                }

            });
        });
    });
};


/*
 * GET addPlaylist?uri=spotify:user:14nicholasse:playlist:4Bni1YMfRtdwQ2jKIvv2lR&requesterUserId=nicky
 * request that a playlist be added to the watchlist
 * TODO: auth headers
 */
module.exports.addPlaylist = (event, context, callback) => {

    let { uri, requesterUserId } = event.queryStringParameters;

    let uriUserHash = crypto.createHash('md5').update(uri+requesterUserId).digest("hex");

    dynamoDb.put({
        TableName: process.env.PLAYLISTS_TO_WATCH_TABLE,
        Item: {
            id: uriUserHash,
            requesterUserId,
            uri,
        },
    }).promise().then((d)=>{
        console.log(`added to watchlist: ${uri}`);
        callback(null, getResponseObject({'message': `added ${uri} to watchlist for ${requesterUserId}`}));
    });
};

/*
 * GET feed?requesterUserId=nicky
 * get diff feed for a user
 * TODO: auth headers
 */
module.exports.userFeed = (event, context, callback) => {

    let requesterUserId = event && event.queryStringParameters && event.queryStringParameters.requesterUserId || null;
    getUserPlaylists(requesterUserId).then(watching=>{
        let uniq = {};
        let feed = [];
        watching.forEach(p=>{
            let {uri} = p;
            uniq[uri] = uri;
        });

        let uris = Object.keys(uniq);
        dynamoDb.scan({
            TableName: process.env.PLAYLIST_DIFFS_TABLE,
            ExpressionAttributeValues: {
                ":value": uris
            },
            FilterExpression: "contains(:value, uri)"
        }).promise().then(a => {
            let res = a.Items;
            res.forEach(x=>{
                x.diff.forEach(thisDiffItem=> {
                    thisDiffItem.playlistId = splitPlaylistURI(x.uri).playlistId;
                    thisDiffItem.uri = x.uri;
                    thisDiffItem.playlistName = x.name;
                    feed.push(thisDiffItem);
                })
            });
            console.log("FEED",feed);
            callback(null, {
                statusCode: 200,
                headers: { "Access-Control-Allow-Origin" : "*" },
                body: JSON.stringify(feed),
            })
        });
    })

};
function getUserPlaylists(requesterUserId = null) {
    return new Promise((resolve, reject) => {
        let params;
        if(requesterUserId === null) {
            params = { TableName: process.env.PLAYLISTS_TO_WATCH_TABLE};
        } else {
            params = {
                TableName: process.env.PLAYLISTS_TO_WATCH_TABLE,
                ExpressionAttributeValues: {
                    ":value": requesterUserId
                },
                FilterExpression: "requesterUserId = :value"
            };
        }
        dynamoDb.scan(params).promise().then((data)=>{
            //now we have playlists user is watching
            resolve(data.Items);
        })
    })
}
/*
 * GET playlists?playlistId=4Bni1YMfRtdwQ2jKIvv2lR
 * Get diffs + info about a playlist
 */

module.exports.getPlaylist = (event, context, callback) => {

    let { playlistId } = event.queryStringParameters;

    dynamoDb.scan({
        TableName: process.env.PLAYLIST_DIFFS_TABLE,
        ExpressionAttributeValues: {
            ":value": playlistId
        },
        FilterExpression: "playlistId = :value"
    }).promise().then((diffData)=>{
        callback(null, getResponseObject({
            diffs: diffData.Items
        }));
    });
};

/*
 * GET playlists/watching
 */
module.exports.getWatchingPlaylists = (event, context, callback) => {

    getUserPlaylists().then((data)=>{
        callback(null, getResponseObject(data));
    });
};


/*
 * Updates the playlists from spotify (this is on cron)
 */
module.exports.fetchAllPlaylists = (event, context, callback) => {

    dynamoDb.scan({
        TableName: process.env.PLAYLISTS_TO_WATCH_TABLE
    }).promise().then((data)=>{
        let promises = data.Items.map((item)=>fetchPlaylist(item.uri));
        Promise.all(promises).then((res)=>{
            console.log('done all',res);
            callback(null, res)
        })
    });
};

function fetchPlaylist(uri) {
    return new Promise((resolve, reject) => {
        let spotifyApi = new SpotifyWebApi({
            clientId : process.env.SPOTIFY_CLIENT_ID,
            clientSecret : process.env.SPOTIFY_CLIENT_SECRET,
        });

        spotifyApi.clientCredentialsGrant()
            .then(function(data) {
                console.log('> The access token expires in ' + data.body['expires_in']);
                console.log('> The access token is ' + data.body['access_token']);
                spotifyApi.setAccessToken(data.body['access_token']);

                fetchPlaylistIfNecessary(uri, spotifyApi).then((fetched)=>{
                    resolve({fetched, uri});
                });

            }, function(err) {
                console.log('Something went wrong when retrieving an access token', err.message);
                reject();
            });


    })
}

/*
 * Checks to see if we already have a playlist @snapshotId
 */
function doesSnapshotIdAlreadyExist(snapshotId) {
    return new Promise((resolve, reject) => {
        dynamoDb.scan({
            TableName: process.env.PLAYLIST_CONTENTS_TABLE,
            ExpressionAttributeValues: {
                ":value": snapshotId
            },
            FilterExpression: "snapshotId = :value"
        }).promise().then((data)=>{
            resolve(data.Count !== 0);
        })
    })
}

function removeEmptyStringElements(obj) {
    for (let prop in obj) {
        if (typeof obj[prop] === 'object') {// dive deeper in
            removeEmptyStringElements(obj[prop]);
        } else if(obj[prop] === '') {// delete elements that are empty strings
            obj[prop] = 'err';
        }
    }
    return obj;
}

/*
 * Fetches the latest version of a playlist (if necessary)
 */
function fetchPlaylistIfNecessary(uri, spotifyApi) {
    return new Promise((resolve, reject) => {
        let { playlistUserId, playlistId } = splitPlaylistURI(uri);
        getPlaylistInfo(playlistUserId, playlistId, spotifyApi).then((playlistInfo)=>{
            // console.log(playlistInfo);
            let { snapshotId, name } = playlistInfo;
            doesSnapshotIdAlreadyExist(snapshotId).then(snapshotExists => {
                if(snapshotExists) {
                    console.log(`fetchPlaylistIfNecessary: ${uri} - current snapshot (${snapshotId}) exists in DB`);
                    resolve({didFetch: false, name});
                } else {
                    getPlaylistTracks(playlistUserId, playlistId, spotifyApi).then((data)=>{
                        let contents = data.map((e)=>({
                            uri: e.track.uri,
                            added_at: e.added_at,
                            name: e.track.name,
                            artists: e.track.artists.map((a)=>a.name)
                        }));
                        let timestamp = new Date().getTime();
                        let Item = removeEmptyStringElements({
                            id: snapshotId,
                            uri,
                            snapshotId,
                            contents,
                            timestamp,
                            name
                        });
                        // console.log("SAVING",Item);
                        dynamoDb.put({
                            TableName: process.env.PLAYLIST_CONTENTS_TABLE,
                            Item,
                        }).promise().then(()=>{
                            let count = data.length;
                            console.log(`fetchPlaylistIfNecessary: ${uri} - fetched snapshot (${snapshotId}) - ${count} tracks`);
                            resolve({didFetch: true, count, name})
                        })
                    })
                }
            });
        });
    })
}

/*
 * gets info about a play list (no tracks incl.)
 */
function getPlaylistInfo(userId, playlistId, apiClient) {
    return new Promise((resolve, reject) => {
        apiClient.getPlaylist(userId, playlistId)
            .then(function(data) {
                // console.log('Some information about this playlist', data.body);
                let { body } = data;
                resolve({
                    description: body.description,
                    followers: body.followers,
                    id: body.id,
                    images: body.images,
                    name: body.name,
                    public: body.public,
                    snapshotId: body.snapshot_id,
                })
            }, function(err) {
                console.log('Something went wrong!', err);
            });
    })
}

/*
 * Gets tracks for a playlist
 *  (recursively)
 */
function getPlaylistTracks(userId, playlistId, apiClient) {
    return new Promise((resolve, reject) => {
        let tracks = [];
        let goFetch = function(offset) {
            apiClient.getPlaylistTracks(userId, playlistId, { offset, limit: 100, })
                .then(function(data) {
                    // console.log('Some information about this playlist', data.body);
                    let { body } = data;
                    console.log(`getPlaylistTracks for playlist ${playlistId} with offset ${offset}: fetched ${body.items.length} items`);
                    tracks = tracks.concat(body.items);
                    if(body.next) {
                      goFetch(offset+100);
                    } else {
                      resolve(tracks);
                    }
                }, function(err) {
                    console.log('Something went wrong!', err);
                    reject(err);
                });
        };
        return goFetch(0);
    })
}
/*
 * Prepares a response object
 */
function getResponseObject(data) {
    return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin" : "*" },
        body: JSON.stringify(data),
    }
}
/*
 * Splits a URI into its components
 */
function splitPlaylistURI(playlistURI) {
    let s = playlistURI.split(':');
    return {
        playlistId: s[4],
        playlistUserId: s[2]
    }
}