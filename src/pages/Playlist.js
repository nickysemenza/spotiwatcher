import React, { Component } from 'react';
import apiFetch from '../utils';
import SpotifyWidget from "../components/SpotifyWidget";

class Playlist extends Component {
    constructor (props) {
        super(props);
        this.state = { info: {
            diffs: []
        } };
    }
    componentDidMount() {
        this.fetchData();
    }

    getPlaylistInfo() {
        let { uri } = this.props.match.params;
        return {
            uri,
            playlistId: uri.split(':')[4]
        }
    }

    fetchData() {
        apiFetch('playlists?playlistId='+this.getPlaylistInfo().playlistId)
            .then((response) => response.json())
            .then((json) => this.setState({info: json}));
    }

    render () {
        let { uri } = this.getPlaylistInfo();
        let diffList = this.state.info.diffs.map(eachDiff=>{
            return eachDiff.diff.map(diffItem=><li>
                added {diffItem.added_at}
                <br/>
                <SpotifyWidget uri={diffItem.uri} />
            </li>)
        })
        return(<div>
            <h1>Viewing playlist {uri}</h1>
            <SpotifyWidget uri={uri} compact={false} />
            <h2>Diffs</h2>
            <ul>{diffList}</ul>
            <pre>{JSON.stringify(this.state.info.diffs,null, 2)}</pre>
        </div>)
    }
}
export default Playlist;
