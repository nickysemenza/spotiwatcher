'use strict';
let SpotifyWebApi = require('spotify-web-api-node');
const AWS = require('aws-sdk');
AWS.config.setPromisesDependency(require('bluebird'));
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const uuid = require('uuid');
const crypto = require('crypto');

module.exports.hello = (event, context, callback) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Go Serverless v1.0! Your function executed successfully!',
      event,
      context
    }),
  };
  callback(null, response);
};

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
            let byId = {};

            data.Items.forEach(item=>{
                if(!byId[item.playlistId])
                    byId[item.playlistId] = [];
                byId[item.playlistId].push(item);
            });

            // console.log(byId);

            let persistDiffPromises = [];

            Object.keys(byId).forEach(function(playlistId) {
                // console.log("aah",key, byId[key]);
                //sort new->old
                byId[playlistId].sort(function(a,b) {return (a.timestamp < b.timestamp) ? 1 : ((b.timestamp < a.timestamp) ? -1 : 0);} );


                let thisPlaylistVersionItem = byId[playlistId];
                for(let x=0; x < thisPlaylistVersionItem.length-1; x++) {
                    let newerItem = thisPlaylistVersionItem[x];
                    let olderItem = thisPlaylistVersionItem[x+1];

                    let newer = newerItem.contents;
                    let older = olderItem.contents;

                    console.log(`Comparing playlist ${playlistId} newer@${newerItem.timestamp}: ${newer.length} items, older@${olderItem.timestamp}: ${older.length} items`);
                    let onlyInNewer = newer.filter(comparer(older));

                    if(onlyInNewer.length > 0) {
                        //persist it
                        console.log('diff:',onlyInNewer);

                        //create a hash out of uri Array to use has primary key
                        let uriHash = crypto.createHash('md5').update(onlyInNewer.map(d=>d.uri).join()).digest("hex");

                        persistDiffPromises.push(new Promise((resolveDBSave, rejectDBSave) => {
                            dynamoDb.put({
                                TableName: process.env.PLAYLIST_DIFFS_TABLE,
                                Item: {
                                    id: uriHash,
                                    diff: onlyInNewer,
                                    playlistId
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
 * GET addPlaylist?playlistId=4Bni1YMfRtdwQ2jKIvv2lR&playlistUserId=14nicholasse&requesterUserId=nicky
 * request that a playlist be added to the watchlist
 * TODO: auth headers
 */
module.exports.addPlaylist = (event, context, callback) => {

    let { playlistId, playlistUserId, requesterUserId } = event.queryStringParameters;

    dynamoDb.put({
        TableName: process.env.PLAYLISTS_TO_WATCH_TABLE,
        Item: {
            id: uuid.v1(),
            playlistUserId,
            playlistId,
            requesterUserId,
        },
    }).promise().then((d)=>{
        console.log(`added to watchlist: ${playlistId}`);
        callback(null, {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Added to watchlist!',
                event,
                context,
                d
            }),
        })
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
            let {playlistId, playlistUserId} = p;
            uniq[playlistId] = playlistUserId;
        });
        // console.log("uniq",uniq);

        let playlistIds = Object.keys(uniq);
        // console.log(playlistIds);
        dynamoDb.scan({
            TableName: process.env.PLAYLIST_DIFFS_TABLE,
            ExpressionAttributeValues: {
                ":value": playlistIds
            },
            FilterExpression: "contains(:value, playlistId)"
        }).promise().then(a => {
            let res = a.Items;
            res.forEach(x=>{
                x.diff.forEach(thisDiffItem=> {
                    thisDiffItem.playlistId = x.playlistId;
                    // thisDiff.playlistName = x.playlistName;
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
        callback(null, {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin" : "*" // Required for CORS support to work
            },
            body: JSON.stringify({
                diffs: diffData.Items
            }),
        })
    });
};

/*
 * GET playlists/watching
 */
module.exports.getWatchingPlaylists = (event, context, callback) => {

    dynamoDb.scan({
        TableName: process.env.PLAYLISTS_TO_WATCH_TABLE
    }).promise().then((data)=>{
        callback(null, {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin" : "*" },
            body: JSON.stringify(data.Items),
        })
    });
};


/*
 * Updates the playlists from spotify (this is on cron)
 */
module.exports.fetchAllPlaylists = (event, context, callback) => {

    dynamoDb.scan({
        TableName: process.env.PLAYLISTS_TO_WATCH_TABLE
    }).promise().then((data)=>{
        let promises = data.Items.map((item)=>fetchPlaylist(item.playlistUserId, item.playlistId));
        Promise.all(promises).then((res)=>{
            // console.log('done all',res);
            callback(null, res)
        })
    });
};

function fetchPlaylist(playlistUserId, playlistId) {
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

                fetchPlaylistIfNecessary(playlistUserId, playlistId, spotifyApi).then((fetched)=>{
                    resolve({fetched, playlistUserId, playlistId});
                });

            }, function(err) {
                console.log('Something went wrong when retrieving an access token', err.message);
                reject();
            });


    })
}

// module.exports.test = (event, context, callback) => {
//     let spotifyApi = new SpotifyWebApi({
//         clientId : process.env.SPOTIFY_CLIENT_ID,
//         clientSecret : process.env.SPOTIFY_CLIENT_SECRET,
//     });
//
//     const playlistUserId = 'prxmusic';
//     const playlistId = '3VEFRGe3APwGRl4eTpMS4x';
//
// // Retrieve an access token
//     spotifyApi.clientCredentialsGrant()
//         .then(function(data) {
//             console.log('> The access token expires in ' + data.body['expires_in']);
//             console.log('> The access token is ' + data.body['access_token']);
//             spotifyApi.setAccessToken(data.body['access_token']);
//
//             fetchPlaylistIfNecessary(playlistUserId, playlistId, spotifyApi).then((fetched)=>{
//                 console.log('done!',fetched);
//                 callback(null, { message: 'yay', event });
//             });
//
//         }, function(err) {
//             console.log('Something went wrong when retrieving an access token', err.message);
//         });
// };

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

function fetchPlaylistIfNecessary(playlistUserId, playlistId, spotifyApi) {
    return new Promise((resolve, reject) => {
        getPlaylistInfo(playlistUserId, playlistId, spotifyApi).then((playlistInfo)=>{
            // console.log(playlistInfo);
            let { snapshotId } = playlistInfo;
            doesSnapshotIdAlreadyExist(snapshotId).then(snapshotExists => {
                if(snapshotExists) {
                    console.log(`fetchPlaylistIfNecessary: ${playlistId} - current snapshot (${snapshotId}) exists in DB`);
                    resolve({didFetch: false});
                } else {
                    getPlaylistTracks(playlistUserId, playlistId, spotifyApi).then((data)=>{
                        let contents = data.map((e)=>({
                            uri: e.track.uri,
                            added_at: e.added_at,
                            name: e.track.name,
                            artists: e.track.artists.map((a)=>a.name)
                        }));
                        let timestamp = new Date().getTime();
                        dynamoDb.put({
                            TableName: process.env.PLAYLIST_CONTENTS_TABLE,
                            Item: {
                                id: uuid.v1(),
                                playlistUserId,
                                playlistId,
                                snapshotId,
                                contents,
                                timestamp
                            },
                        }).promise().then(()=>{
                            let count = data.length;
                            console.log(`fetchPlaylistIfNecessary: ${playlistId} - fetched snapshot (${snapshotId}) - ${count} tracks`);
                            resolve({didFetch: true, count})
                        })
                    })
                }
            });
        });
    })
}

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