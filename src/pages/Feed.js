import React, { Component } from 'react';
import apiFetch from '../utils';
import {Link} from "react-router-dom";
import SpotifyWidget from "../components/SpotifyWidget";

class Playlist extends Component {
    constructor (props) {
        super(props);
        this.state = { feed: [] };
    }
    componentDidMount() {
        this.fetchData(this.getUserId());
    }

    fetchData(user) {
        let x;
        if(user) {
            x = apiFetch('feed?requesterUserId='+user);
        } else {
            x = apiFetch('feed');
        }
        x.then((response) => response.json()).then((json) => this.setState({feed: json}));

    }
    getUserId() {
        return this.props.match.params.userId ? this.props.match.params.userId : null
    }

    render () {
        let userId = this.getUserId();
        let diffList = this.state.feed.map(feedItem=>
            <li key={feedItem.added_at}>
                added at {feedItem.added_at} to <Link to={`/playlist/${feedItem.uri}`}>{feedItem.playlistName} [{feedItem.uri}]</Link>
                <br/>
                <SpotifyWidget uri={feedItem.uri} />
            </li>
        );
        return(<div>
            <h1>Viewing Feed for {userId}</h1>
            <h2>Diffs</h2>
            <ul>{diffList}</ul>
        </div>)
    }
}
export default Playlist;
