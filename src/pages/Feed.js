import React, { Component } from 'react';
import apiFetch from '../utils';
import {Link} from "react-router-dom";
import SongWidget from "../components/SongWidget";

class Playlist extends Component {
    constructor (props) {
        super(props);
        this.state = { feed: [] };
    }
    componentDidMount() {
        this.fetchData();
    }

    fetchData() {
        apiFetch('feed')
            .then((response) => response.json())
            .then((json) => this.setState({feed: json}));
    }

    render () {
        let diffList = this.state.feed.map(feedItem=>
            <li>
                added at {feedItem.added_at} to {feedItem.playlistId}
                <br/>
                <SongWidget uri={feedItem.uri} />
            </li>
        );
        return(<div>
            <h1>Viewing FEED</h1>
            <h2>Diffs</h2>
            <ul>{diffList}</ul>
        </div>)
    }
}
export default Playlist;
