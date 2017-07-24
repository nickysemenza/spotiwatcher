import React, { Component } from 'react';
import apiFetch from '../utils';
import {Link} from "react-router-dom";
import SongWidget from "../components/SongWidget";

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

    fetchData() {
        apiFetch('playlists?playlistId='+this.props.match.params.playlistId)
            .then((response) => response.json())
            .then((json) => this.setState({info: json}));
    }

    render () {
        let { playlistId } = this.props.match.params;
        let diffList = this.state.info.diffs.map(eachDiff=>{
            return eachDiff.diff.map(diffItem=><li>
                added {diffItem.added_at}
                <br/>
                <SongWidget uri={diffItem.uri} />
            </li>)
        })
        return(<div>
            <h1>Viewing playlist {playlistId}</h1>
            <h2>Diffs</h2>
            <ul>{diffList}</ul>
            <pre>{JSON.stringify(this.state.info.diffs,null, 2)}</pre>
        </div>)
    }
}
export default Playlist;
